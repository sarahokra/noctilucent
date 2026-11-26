const {Plugin, Notice, Modal, normalizePath, ItemView, setIcon, PluginSettingTab, Setting, Menu}=require('obsidian');
const COLORS=['#F5D547','#F3A05C','#ED94B7','#A9D38C','#78B8ED','#B5A0DE','#73D2CD','#B4B8BF'];

const SIDEBAR='noctilucent-annotations';
const clone=x=>JSON.parse(JSON.stringify(x));
const sticky=a=>a?.type==='sticky-note'||a?.type==='epub-note';
const area=a=>a?.type==='area'||a?.type==='epub-region';
const special=a=>sticky(a)||area(a);
const point=a=>sticky(a)?a.anchor:a.rects?.[0];
const clamp01=n=>Math.max(0,Math.min(1,n));
// Perf: a Range already registered with identical boundary points paints identically, so the
// CSS Highlight need not be rebuilt (avoids restyle/repaint on every mutation burst).
const sameHighlightRanges=(highlight,ranges)=>{
 if(!highlight||typeof highlight[Symbol.iterator]!=='function'||highlight.size!==ranges.length)return false;
 let i=0;
 for(const old of highlight){const next=ranges[i++];
  if(!next||old.startContainer!==next.startContainer||old.startOffset!==next.startOffset||old.endContainer!==next.endContainer||old.endOffset!==next.endOffset)return false;}
 return i===ranges.length;
};
// Perf: last client rect that passes the visibility threshold, without allocating arrays.
const lastVisibleRect=range=>{const list=range.getClientRects();for(let i=list.length-1;i>=0;i--){const r=list[i];if(r.width>0.3&&r.height>0.3)return r;}return null;};
// PDF visual line endings are not paragraph breaks. Keep the stored quote untouched.
const readableQuoteRaw=value=>String(value??'').replace(/([^\r\n\t ])[^\S\r\n]*\r?\n(?:[^\S\r\n]*\r?\n)*[^\S\r\n]*(?=\S)/gu,(match,left,offset,source)=>{
 const right=Array.from(source.slice(offset+match.length))[0]||'';
 return left+((/\p{Script=Han}/u.test(left)&&/\p{Script=Han}/u.test(right))||/[（「『《【]/u.test(left)||/[，。；：！？、）」』》】]/u.test(right)?'':' ');
}).replace(/[\r\n\t ]+/g,' ').trim();
// Perf: pure function of its input; memoise (bounded) because sidebar search/render call it per item.
const readableQuoteCache=new Map();
const readableQuote=value=>{const text=String(value??'');let out=readableQuoteCache.get(text);if(out===undefined){out=readableQuoteRaw(text);if(readableQuoteCache.size>=2000)readableQuoteCache.clear();readableQuoteCache.set(text,out);}return out;};
// New quotes only. Never infer mathematical operators from a control code alone.
const badQuoteChar=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]/u;
const normalizeNewQuote=(value,replacements=null,spaces=null,details=null)=>{
 const raw=String(value??'');let inferred=false,unresolved=false;
 const normalized=raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\ufffd]/gu,(ch,i,src)=>{
  if(replacements?.has(i))return replacements.get(i);
  if(spaces?.has(i)){if(details)details.set(i,'spacing-verified');return ' ';}
  const left=src.slice(0,i).match(/[^\s]$/u)?.[0]||src.slice(0,i).trimEnd().slice(-1),right=src.slice(i+1).trimStart()[0]||'';
  const han=c=>/\p{Script=Han}/u.test(c),latin=c=>/[A-Za-z]/u.test(c),digit=c=>/[0-9]/u.test(c);
  // A separator between words, or a Han/number boundary, is plausible; never
  // infer a separator between two numbers, before a bare number, or near operators.
  if(ch==='\x01'&&((han(left)&&han(right))||(latin(left)&&latin(right))||(han(left)&&latin(right))||(latin(left)&&han(right))||(han(left)&&digit(right))||(digit(left)&&han(right))||(left==='%'&&han(right)))){
   inferred=true;if(details)details.set(i,'spacing-inferred');return (han(left)&&(han(right)||digit(right))||digit(left)&&han(right))?'':' ';
  }
  unresolved=true;if(details)details.set(i,'unresolved');return '⟦U+'+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')+'⟧';
 });
 const text=readableQuote(normalized).replace(/[^\S\r\n]+/gu,' ').trim();
 return {normalizedText:text,normalizationVersion:spaces?.size?3:replacements?.size?2:1,normalizationStatus:unresolved?'unresolved':inferred?'inferred-spacing':'clean'};
};
const quoteText=a=>typeof a.normalizedText==='string'?a.normalizedText:readableQuote(a.text);
const quoteWarning=a=>a.normalizationStatus==='unresolved'?T('⚠ 原文含未辨識字元，請核對 PDF'):a.normalizationStatus==='inferred-spacing'?T('原文間距經推定整理，引用前請核對 PDF'):'';
const DEFAULT_EXPORT={source:true,location:true,quote:true,note:true,type:true,color:true,created:false,modified:false,pin:true,id:true};
const EXPORT_FIELDS={source:'原始文件連結',location:'頁碼／位置資訊',quote:'高亮原文',note:'批註內容',type:'批註類型',color:'色票資訊',created:'建立時間',modified:'修改時間',pin:'釘選狀態',id:'批註 ID'};
const EXPORT_LAYOUTS={cards:'卡片',report:'報告',sections:'分區',parallel:'雙欄',matrix:'矩陣',minimal:'極簡雙欄',plain:'純 Markdown'};
const EXPORT_COLOR_NAMES=['黃色','橘色','粉色','綠色','藍色','紫色','青色','灰色'];
const exportColorIndex=a=>COLORS.findIndex(c=>c.toLowerCase()===String(a?.color||'').toLowerCase());
const exportColorName=a=>T(EXPORT_COLOR_NAMES[exportColorIndex(a)]||'其他顏色');
const exportLayoutName=k=>T(EXPORT_LAYOUTS[k]||EXPORT_LAYOUTS.cards);
const exportOptions=()=>Object.keys(EXPORT_LAYOUTS).map(k=>[k,'✦ '+exportLayoutName(k)]);
const exportGroupOptions=()=>[['page',T('依頁次＋釘選')],['color',T('依色票')]];
const safeLayout=k=>Object.hasOwn(EXPORT_LAYOUTS,k)?k:'cards';
const safeGroup=k=>k==='color'?'color':'page';
const DEFAULT_SAVE={auto:true,delay:500,button:true,status:true,normalizeNew:true,symbolRecovery:true,smartGeometry:true};
// Experimental, read-only font recovery. No PDF writes, no background parsing.
const recoveryCrypto=()=>require('crypto');
const contextDigest=s=>recoveryCrypto().createHash('sha256').update(s,'utf8').digest('hex');
const compactQuote=s=>{const chars=[],offsets=[];for(let i=0;i<s.length;){const c=String.fromCodePoint(s.codePointAt(i));if(!/\s/u.test(c)||badQuoteChar.test(c)){chars.push(c);offsets.push(i);}i+=c.length;}return {chars,offsets};};
// The private native adapter is optional. A supported standard glyph name and
// explicit original char code + matching Unicode are required, never a font name alone.
const STANDARD_SYMBOL_GLYPHS=Object.freeze({equal:'=',notequal:'≠',plusminus:'±',minus:'−',less:'<',greater:'>',lessequal:'≤',greaterequal:'≥',plus:'+',multiply:'×',divide:'÷',alpha:'α',beta:'β',chi:'χ',Delta:'Δ',mu:'μ',sigma:'σ',approximatelyequal:'≈',approxequal:'≈'});
const VERIFIED_LEGACY_GLYPHS=Object.freeze({'Universal-GreekwithMathPi':{H11006:'±',H11005:'=',H11002:'−',H11021:'<',H11011:'∼',H11022:'>',H9004:'Δ'},'MathematicalPi-One':{H9273:'χ',H9251:'α',H11350:'≥',H9252:'β'},'MathematicalPi-Four':{H11549:'=',H11545:'+'}});
function glyphSymbol(fontName,glyphName){const name=String(glyphName||'').replace(/^\//,'');if(Object.hasOwn(STANDARD_SYMBOL_GLYPHS,name))return STANDARD_SYMBOL_GLYPHS[name];const family=String(fontName||'').replace(/^[A-Z]{6}\+/,'');const map=VERIFIED_LEGACY_GLYPHS[family];return map&&Object.hasOwn(map,name)?map[name]:null;}
let verifiedIndex;
function getVerifiedIndex(){return verifiedIndex??=(JSON.parse(VERIFIED_CONTEXT_JSON));}
function sampleReplacements(raw,table){const {chars,offsets}=compactQuote(raw),replacements=new Map();if(!table||chars.length>16000)return replacements;for(let i=0;i<chars.length;i++){if(!badQuoteChar.test(chars[i]))continue;const values=new Set();for(const [l,r] of [[6,6],[4,4],[0,6],[6,0],[3,3],[2,4],[4,2],[1,5],[5,1],[0,5],[1,4],[2,3],[3,2],[4,1],[5,0]]){if(l>i||r>=chars.length-i)continue;const token=contextDigest(l+':'+r+':'+chars.slice(i-l,i+r+1).join(''));if(Object.hasOwn(table,token))values.add(table[token]);}if(values.size===1)replacements.set(offsets[i],values.values().next().value);}return replacements;}
// Verified blank glyphs: exact PDF fingerprint and page contexts only.
let verifiedSpacingIndex;
function verifiedSpaceReplacements(raw,hash,page){if(!hash)return new Map();const table=(verifiedSpacingIndex??=JSON.parse(VERIFIED_SPACING_JSON))[hash]?.[String(page)];const candidates=sampleReplacements(raw,table);if(!candidates.size)return candidates;const prior=new Map();normalizeNewQuote(raw,null,null,prior);for(const i of candidates.keys())if(prior.get(i)!=='unresolved')candidates.delete(i);return candidates;}
function nativePageInfo(view,pageEl,num){try{const child=view?.viewer?.child;const pv=child?.getPage?.(num);if(pv?.div!==pageEl||pv.pdfPage?.pageNumber!==num)return null;const pdfPage=pv.pdfPage;if(typeof pdfPage.getTextContent!=='function')return null;return {pdfPage,ops:pageEl.ownerDocument.defaultView?.pdfjsLib?.OPS||globalThis.pdfjsLib?.OPS};}catch{return null;}}
function matchingTextItems(raw,items){const needle=compactQuote(raw);if(needle.chars.length<6||needle.chars.length>16000)return null;const chars=[],fonts=[];for(const item of items){if(typeof item.str!=='string')continue;for(const c of compactQuote(item.str).chars){chars.push(c);fonts.push(item.fontName);}if(chars.length>120000)return null;}const page=chars.join(''),selection=needle.chars.join('');const start=page.indexOf(selection);if(start<0||page.indexOf(selection,start+1)!==-1)return null;const offset=Array.from(page.slice(0,start)).length;return {chars:needle.chars,offsets:needle.offsets,fonts:fonts.slice(offset,offset+needle.chars.length)};}
function collectNativeEvidence(page,operators,ops,targets){const evidence=new Map(),counts=new Map(),stats={named:0,unknown:0};let font=null;const stack=[];if(!ops||!Number.isInteger(ops.setFont)||!Number.isInteger(ops.showText)||operators.fnArray.length>150000)return {evidence,counts,stats};const show=new Set([ops.showText,ops.showSpacedText,ops.nextLineShowText,ops.nextLineSetSpacingShowText].filter(Number.isInteger));for(let i=0;i<operators.fnArray.length;i++){const op=operators.fnArray[i],args=operators.argsArray[i]||[];if(op===ops.save||op===ops.paintFormXObjectBegin||op===ops.beginGroup){stack.push(font);continue;}if(op===ops.restore||op===ops.paintFormXObjectEnd||op===ops.endGroup){font=stack.length?stack.pop():null;continue;}if(op===ops.setFont){font=typeof args[0]==='string'?args[0]:null;continue;}if(op===ops.setGState){for(const entry of args[0]||[])if(entry?.[0]==='Font')font=typeof entry[1]?.[0]==='string'?entry[1][0]:null;continue;}if(!show.has(op)||!targets.has(font))continue;const glyphs=args.find(Array.isArray);if(!glyphs)continue;let f;try{f=page.commonObjs.get(font);}catch{}for(const g of glyphs){if(!g||typeof g!=='object'||typeof g.unicode!=='string'||!badQuoteChar.test(g.unicode))continue;const key=font+'\0'+g.unicode;counts.set(key,(counts.get(key)||0)+1);let val=null;const code=g.originalCharCode;if(g.unicode.length===1&&Number.isInteger(code)&&code>=0&&code<=255&&(f?.composite===false||['Type1','TrueType','Type1C'].includes(f?.type))){const name=f?.differences?.[code];if(typeof name==='string')val=glyphSymbol(f.name,name);else if(typeof g.glyphName==='string')val=glyphSymbol(f?.name,g.glyphName);}if(val)stats.named++;else stats.unknown++;if(!evidence.has(key))evidence.set(key,val);else if(evidence.get(key)!==val)evidence.set(key,null);}}return {evidence,counts,stats};}
async function readNativeSymbols(native,raw,shouldStop=()=>false){const replacements=new Map(),diagnostic={nativePage:!!native,uniqueText:false,namedGlyphs:0,unknownGlyphs:0,nativeMatches:[]};if(!native?.ops||shouldStop())return {replacements,diagnostic};try{const p=native.pdfPage,content=await p.getTextContent({disableNormalization:true});if(shouldStop()){diagnostic.deferred=true;return {replacements,diagnostic};}const match=matchingTextItems(raw,content.items||[]);if(!match)return {replacements,diagnostic};diagnostic.uniqueText=true;const targets=new Set(match.fonts.filter((f,i)=>f&&badQuoteChar.test(match.chars[i])));if(!targets.size)return {replacements,diagnostic};const operators=await p.getOperatorList();if(shouldStop()){diagnostic.deferred=true;return {replacements,diagnostic};}const {evidence,counts,stats}=collectNativeEvidence(p,operators,native.ops,targets);const expected=new Map();for(const item of content.items||[]){if(!targets.has(item.fontName)||typeof item.str!=='string')continue;for(const ch of item.str){if(!badQuoteChar.test(ch))continue;const key=item.fontName+'\0'+ch;expected.set(key,(expected.get(key)||0)+1);}}diagnostic.namedGlyphs=stats.named;diagnostic.unknownGlyphs=stats.unknown;for(let i=0;i<match.chars.length;i++){const key=match.fonts[i]+'\0'+match.chars[i],val=evidence.get(key);if(badQuoteChar.test(match.chars[i])&&val&&expected.get(key)===counts.get(key)){replacements.set(match.offsets[i],val);diagnostic.nativeMatches.push({offset:match.offsets[i],fontId:match.fonts[i]});}}}catch{diagnostic.apiUnavailable=true;}return {replacements,diagnostic};}
// Gap bridging operates only on the current selection and only when a selected
// control character is actually present between the two ordinary fragments.
function mergeLegacyRects(raw,width){const out=[];for(const r of raw){const prev=out.at(-1);if(prev&&Math.abs(prev.y+prev.h/2-r.y-r.h/2)<Math.min(prev.h,r.h)*.35&&r.x<=prev.x+prev.w+2/width&&r.x+r.w>=prev.x-2/width){const x=Math.min(prev.x,r.x),y=Math.min(prev.y,r.y);prev.w=Math.max(prev.x+prev.w,r.x+r.w)-x;prev.h=Math.max(prev.y+prev.h,r.y+r.h)-y;prev.x=x;prev.y=y;}else if(!out.some(q=>Math.abs(q.x-r.x)<.0002&&Math.abs(q.y-r.y)<.0002&&Math.abs(q.w-r.w)<.0002&&Math.abs(q.h-r.h)<.0002))out.push({...r});}return out;}
function smartGapRects(segments,width,height){const raw=segments.flatMap(s=>s.rects),parents=raw.map((_,i)=>i),ids=new Map(raw.map((r,i)=>[r,i]));const root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};let count=0;const details=[];
 const onlyControl=s=>s&&badQuoteChar.test(s.text)&&Array.from(s.text).every(c=>/\s/u.test(c)||badQuoteChar.test(c));
 const bridge=(left,right,middle)=>{const a=left?.rects.at(-1),b=right?.rects[0];if(!a||!b)return;const h=Math.min(a.h,b.h),gap=b.x-a.x-a.w;const center=Math.abs(a.y+a.h/2-b.y-b.h/2);const vo=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(gap<=2/width||gap*width>Math.min(28,1.4*h*height)||center>.25*h||vo<.75*h||Math.max(a.h,b.h)>1.55*h||a.w*width<1||b.w*width<1)return;const extra=middle.flatMap(s=>s.rects);if(extra.some(r=>r.x<a.x+a.w-2/width||r.x+r.w>b.x+2/width||Math.abs(r.y+r.h/2-(a.y+a.h/2))>.65*h))return;const ia=ids.get(a),ib=ids.get(b);const ra=root(ia),rb=root(ib);if(ra===rb)return;parents[rb]=ra;for(const q of extra)parents[root(ids.get(q))]=ra;count++;if(details.length<64)details.push({gapPx:Math.round(gap*width*100)/100,lineHeightPx:Math.round(h*height*100)/100,bridged:true});};
 for(let i=0;i<segments.length;i++){const s=segments[i];if(onlyControl(s)){let j=i;while(j+1<segments.length&&onlyControl(segments[j+1]))j++;if(j-i<=1)bridge(segments[i-1],segments[j+1],segments.slice(i,j+1));i=j;}else if(i+1<segments.length&&!onlyControl(segments[i+1])){const next=segments[i+1];if(badQuoteChar.test(s.text.trimEnd().slice(-1))||badQuoteChar.test(next.text.trimStart().slice(0,1)))bridge(s,next,[]);}}
 if(!count)return {rects:mergeLegacyRects(raw,width),count:0,details};const groups=new Map();for(let i=0;i<raw.length;i++){const key=root(i),r=raw[i],q=groups.get(key);if(!q)groups.set(key,{...r});else{const x=Math.min(q.x,r.x),y=Math.min(q.y,r.y);q.w=Math.max(q.x+q.w,r.x+r.w)-x;q.h=Math.max(q.y+q.h,r.y+r.h)-y;q.x=x;q.y=y;}}return {rects:mergeLegacyRects([...groups.values()],width),count,details};}

const VERIFIED_CONTEXT_JSON=/*__VERIFIED_CONTEXT_JSON__*/"";

// Noctilucent i18n. Translation changes labels only, never annotation content or anchors.
const I18N_EN=Object.freeze({"顯示預覽":"Preview notes","收合預覽":"Hide previews","展開卡片":"Open cards","收合卡片":"Close cards","顯示目前文件已定位的文字批註預覽；再次點擊收合":"Show text previews for located notes in this document; click again to hide","EPUB：拖曳區域內部可移動；拖曳四角可調整大小，Esc 結束":"EPUB: Drag inside the region to move; drag a corner to resize; Esc to finish","EPUB：圖片資源無法安全擷取":"EPUB: Unable to safely capture image resource","⚠ 原文含未辨識字元，請核對 PDF":"⚠ Unrecognized characters in the quote; check the PDF","原文間距經推定整理，引用前請核對 PDF":"Spacing was inferred; verify against the PDF before citing","Noctilucent · 批註儲存":"Noctilucent · Annotation Saving","自動儲存":"Autosave","停止輸入後合併儲存；關閉時仍會在離開編輯器或其他資料操作時儲存。":"Save after typing stops; leaving the editor or changing data still saves when disabled.","自動儲存延遲":"Autosave delay","持續輸入時最多約 5 秒提交一次（不含組字及磁碟等待）。":"While typing, save at least every ~5 seconds (excluding composition and disk latency).","手動儲存按鈕":"Manual save button","在批註編輯器顯示儲存按鈕；Ctrl+S 仍可使用。":"Show a Save button in annotation editors; Ctrl+S remains available.","儲存狀態":"Save status","顯示已儲存、等待、寫入或失敗。":"Show saved, pending, saving, or failed status.","PDF 文字擷取":"PDF text extraction","新高亮文字容錯":"Normalize new highlight text","僅在新增文字高亮時整理間距；不修復既有批註。未確認的控制字元顯示代碼，不猜測統計符號。":"Normalize spacing for new highlights only; preserve existing notes. Show unknown control codes without guessing statistical symbols.","實驗：字型感知符號還原":"Experimental: font-aware symbol recovery","僅新增高亮且有異常字元時執行。已驗證 PDF 依檔案 SHA-256 與原文上下文還原；其他 PDF 需原生介面提供可靠字形證據。":"Run only for new highlights with anomalous characters. Verified PDFs use SHA-256 and text context; other PDFs require reliable native glyph evidence.","實驗：智慧高亮缺口接合":"Experimental: smart highlight gap bridging","僅接合選取範圍內含異常字元且相鄰同一行的小缺口；不重繪舊標記。":"Bridge small same-line gaps next to anomalous characters in a new selection; do not redraw old highlights.","立即儲存全部待寫入資料":"Save all pending changes now","儲存":"Save","匯出高亮與批註":"Export Highlights & Annotations","格式：Markdown（.md） · 全部高亮與批註 · 包含顏色、頁碼／投影片資訊及來源連結":"Format: Markdown (.md) · All highlights and annotations · Includes colors, page/slide information, and source links","匯出檔名":"Export filename","請輸入有效的檔名":"Enter a valid filename","只建立新的匯出筆記；不更動原始文件或 Noctilucent 的 data.json。":"Creates a new export note only; does not change source documents or Noctilucent data.json.","取消":"Cancel","建立 Markdown":"Create Markdown","請輸入有效的匯出檔名":"Enter a valid export filename","鎖定文件":"Lock document","搜尋原文或批註…":"Search quotes or notes…","搜尋原文或批註":"Search quotes or notes","原文＋批註":"Quotes + notes","僅原文":"Quotes only","僅批註":"Notes only","搜尋範圍":"Search scope","全部":"All","有批註":"With notes","純高亮":"Highlights only","自由批註":"Free note","區域批註":"Area annotation","批註篩選":"Annotation filter","頁碼順序":"Page order","最新建立":"Newest first","排序":"Sort","全部顏色":"All colors","色票 ":"Color ","詳細卡片":"Detailed cards","複製全部":"Copy all","複製目前 PDF 的所有批註（含未篩選項目）":"Copy all annotations for this document (including filtered-out items)","展開有批註卡片":"Open annotated cards","開啟目前文件所有含文字批註的浮動卡片；再次點擊僅收合這次展開的卡片":"Open all floating cards with notes in this document; click again to close only these cards.","全部刪除…":"Delete all…","備份後刪除目前文件全部標記，不受搜尋或篩選影響":"Back up and delete all markers in this document, regardless of search or filters.","匯出高亮與批註…":"Export highlights & annotations…","將目前文件全部標記（不受搜尋與顏色篩選影響）匯出成獨立 Markdown 筆記":"Export all markers in the document as a separate Markdown note, ignoring search and color filters.","區域批註 area highlight":"Area annotation area highlight","自由批註 sticky note":"Free note sticky note","請先開啟 PDF 或 Markdown":"Open a PDF or a reading document first","解除鎖定":"Unlock","收合批註視窗":"Close annotated cards","緊湊清單":"Compact list","沒有符合條件的批註":"No matching annotations","開啟 PDF 或 Markdown 閱讀模式後會自動顯示批註":"Open a PDF or Reading View to see annotations.","📌 已釘選 · ":"📌 Pinned · "," 筆":" items","取消釘選":"Unpin","釘選置頂（每份文件最多 3 筆）":"Pin to top (up to 3 per document)","跳到原文":"Jump to source","編輯":"Edit","編輯批註":"Edit annotation","更改標記顏色":"Change marker color","複製":"Copy","複製區域圖片及批註":"Copy area image and annotation","複製原文及批註":"Copy quote and annotation","刪除標記與批註":"Delete marker and annotation","（無原文）":"(No source quote)","輸入批註（自動儲存）":"Enter annotation (autosaved)"," 文件":" document","第 ":"Page "," 頁":"","批註":"annotation","改色 ":"Change color ","拖曳文字閱讀工具列":"Drag Reading View toolbar","連續：關":"Continuous: Off","連續高亮：選取閱讀模式中的文字便自動高亮，Esc 關閉":"Continuous highlighting: selecting text highlights automatically; Esc to exit.","高亮目前選取的文字":"Highlight selected text","橡皮擦：點擊高亮擦除（有批註須確認，Esc 退出）":"Eraser: click highlights to erase (confirm notes; Esc to exit)","使用色票 ":"Use color ","撤回此文件的標記":"Undo markers in this document","本次工作階段沒有可撤回的標記":"Nothing to undo in this session","重做此文件的標記":"Redo markers in this document","沒有可重做的標記":"Nothing to redo","開啟或收起此文件的批註側邊欄":"Toggle annotation sidebar","此標記含有文字批註，擦除後批註也會移除。要繼續嗎？":"This marker has a note that will also be deleted. Continue?","橡皮擦：請點擊或拖過已高亮的文字":"Eraser: click or drag over highlighted text","連續：":"Continuous: ","開":"On","關":"Off","請在文字閱讀畫面中選取同一段落內的文字":"Select text within a single paragraph in Reading View.","原文已重新排版，請再次選取文字":"The source was reflowed; select the text again.","原文位置已變動，請重新選取":"The source position changed; select again.","開啟批註":"Open annotation","新增批註／編輯批註":"Add / edit annotation"," 批註":" annotation","關閉":"Close","拖曳批註視窗（按住滑鼠左鍵或右鍵）":"Drag annotation card (hold left or right mouse button)","更改高亮顏色":"Change highlight color","更改高亮顏色 ":"Change highlight color ","複製原文＋批註":"Copy quote + note","複製失敗":"Copy failed","刪除標記":"Delete marker","刪除這個高亮與批註？":"Delete this highlight and its annotation?","找不到原始文件":"Source file not found","Office Viewer 的投影片跳轉控制項不可用":"Slide navigation controls are unavailable in Office Viewer.","舊批註缺少投影片編號；簡報超過 60 頁，為避免大量換頁，請先手動接近該頁再跳轉。":"This legacy annotation has no slide number; the deck exceeds 60 slides. Navigate closer manually to avoid excessive slide switching.","找不到可安全定位的原文（可能尚未到達對應投影片），未自動開啟批註":"Source text could not be located safely (possibly on another slide); annotation was not opened.","Noctilucent 批註":"Noctilucent annotations","Noctilucent：工具列位置已重設":"Noctilucent: toolbar position reset","請先開啟 PDF":"Open a PDF first","已將最近一次符號辨識摘要輸出至開發者工具 Console":"Latest symbol-recovery diagnostics were written to the developer console.","請先新增含異常符號的高亮":"Create a highlight with unusual symbols first.","已複製本次工作階段的符號診斷紀錄":"Symbol diagnostics copied for this session.","剪貼簿寫入失敗，請使用 Console 診斷指令。":"Could not copy to clipboard; use the developer console.","Noctilucent：儲存失敗，請保留插件並按儲存重試。":"Noctilucent: save failed. Keep the plugin open and retry saving.","儲存失敗 · 請重試":"Save failed · Retry","儲存中…":"Saving…","等待儲存":"Pending save","已儲存":"Saved","點擊 PDF 任意位置新增自由批註，Esc 取消":"Click anywhere on the PDF to add a free note; Esc to cancel.","新增自由批註":"Add free note","自由批註：點擊編輯，拖曳移動":"Free note: click to edit, drag to move","按住左鍵拖曳框選區域，Esc 取消":"Drag to select an area; Esc to cancel.","區域批註：點擊編輯，右鍵調整":"Area annotation: click to edit, right-click to adjust","結束調整":"Finish adjusting","移動／調整區域":"Move / resize area","複製區域圖片":"Copy area image","刪除區域":"Delete area","移動區域":"Move area","調整大小":"Resize","區域樣式":"Area style","半透明填色":"Translucent fill","彩色外框":"Colored outline","填色＋外框":"Fill + outline","填色不透明度":"Fill opacity","複製圖片":"Copy image","調整區域":"Adjust area","PDF 頁面尚未完成渲染":"PDF page is not yet rendered","PDF 畫布不可見":"PDF canvas is not visible","區域不在畫布內":"Area is outside the canvas","PNG 轉換失敗":"PNG conversion failed","已複製原始區域圖片":"Original area image copied","無法複製圖片：":"Could not copy image: ","找不到區域批註":"Area annotation not found","請先開啟原始 PDF 並等待該頁渲染":"Open the source PDF and wait for the page to render.","批註已不存在":"Annotation no longer exists","圖片編碼失敗":"Image encoding failed","\" alt=\"PDF 區域圖片\"></p>":"\" alt=\"PDF area image\"></p>","已複製區域圖片＋批註（富文字貼上）":"Copied area image + note (rich-text paste)","無法複製圖片＋批註：":"Could not copy image + annotation: ","已撤回整批刪除":"Batch deletion undone","已撤回擦除":"Erasure undone","已撤回高亮顏色":"Highlight color change undone","撤回此標記也會移除其文字批註，確定嗎？":"Undoing this marker will remove its note. Continue?","已撤回標記":"Marker undone","已重做整批刪除":"Batch deletion redone","已重做擦除":"Erasure redone","已重做高亮顏色":"Highlight color change redone","已重做標記":"Marker redone","請先在 PDF 同一頁選取文字。":"Select text on the same PDF page first.","Noctilucent：擷取文字含未辨識符號，請核對 PDF 原文。":"Noctilucent: extracted text has unknown symbols; verify the PDF.","Noctilucent：符號未確認，請核對 PDF 原文。":"Noctilucent: unverified symbol; check the PDF.","Noctilucent：無法確認符號映射，原始文字與警告已保留。":"Noctilucent: symbol mapping unavailable; original quote and warning preserved.","Noctilucent：符號辨識不可用，請核對 PDF 原文。":"Noctilucent: symbol recognition unavailable; check the PDF.","Noctilucent：部分符號未能確認，請核對 PDF。":"Noctilucent: some symbols remain unverified; check the PDF.","拖曳工具列":"Drag toolbar","切換文字螢光筆的連續模式":"Toggle continuous text highlighting","標記選取文字":"Highlight selected text","自由批註：點擊 PDF 任意位置（Esc 取消）":"Free note: click anywhere in PDF (Esc to cancel)","區域高亮：拖曳框選（Esc 取消）":"Area highlight: drag to select (Esc to cancel)","橡皮擦：點擊或拖過文字高亮、自由批註圖示及區域高亮（Esc 退出）":"Eraser: click or drag over highlights, free-note icons, and highlighted areas (Esc to exit)","撤回標記":"Undo marker","重做標記":"Redo marker","開啟／收起批註側邊欄":"Toggle annotation sidebar","新增批註／修改顏色":"Add note / change color","⠿ 區域批註 · p. ":"⠿ Area annotation · p. ","⠿ 自由批註 · p. ":"⠿ Free note · p. ","⠿ 批註 · p. ":"⠿ Annotation · p. ","複製圖片＋批註":"Copy image + note","無法開啟批註側邊欄":"Could not open annotation sidebar","Noctilucent：每份文件最多釘選三筆，請先取消一筆。":"Noctilucent: up to 3 pins per document; unpin an item first.","目前文件沒有可刪除的標記":"No markers to delete in this document","儲存尚未成功，已取消全部刪除":"Save is not complete; delete-all was canceled.","無法確認備份檔存在":"Could not verify backup file","備份失敗：未刪除任何標記。":"Backup failed: no markers were deleted.","刪除儲存失敗：已恢復記憶體中的標記；保留備份 ":"Delete save failed: in-memory markers restored; backup retained at ","目前文件沒有可匯出的標記":"No markers to export in this document","投影片編號未確認":"Slide number unverified","PDF 頁碼未確認":"PDF page number unverified","Word 文件（文字錨點）":"Word document (text anchor)","Markdown 閱讀模式（文字錨點）":"Markdown Reading View (text anchor)","開啟原始文件":"Open source document","- 來源文件：`":"- Source file: `","- 匯出時間：":"- Exported at: ","- 標記數量：":"- Markers: ","- 含文字批註：":"- With notes: ","- 內容：全部高亮、批註、標記顏色、可確認的位置與來源連結":"- Contents: all highlights, annotations, colors, verified positions, and source links","> 此文件是獨立的匯出快照；修改此筆記不會回寫 Noctilucent，也不會更動原始文件。":"> This is a standalone export snapshot. Editing it will not update Noctilucent or the source document.","開啟來源文件":"Open source file","**來源：** ":"**Source:** ","**注意：** 來源文件目前不存在於 Vault，無法建立有效來源連結。":"**Note:** Source file is not currently in the vault; no valid source link is available.","區域高亮":"Area highlight","文字高亮":"Text highlight","- 顏色：`":"- Color: `","未記錄":"Not recorded"," · 📌 已釘選":" · 📌 Pinned","- 位置：":"- Location: ","- 返回來源：":"- Back to source: ","- 返回來源：未能產生可用連結":"- Back to source: no valid link available","- 標記類型：PDF 區域高亮（此版本不包含區域截圖）":"- Marker type: PDF area highlight (no area screenshot in this version)","- 標記類型：PDF 自由批註":"- Marker type: PDF free note","**高亮原文**":"**Highlighted quote**","（原文未記錄）":"(Source quote not recorded)","⚠ PDF 原文可能含未辨識的字元，引用前請核對。":"⚠ The PDF quote may have unrecognized characters; verify before citing.","**我的批註**":"**My note**","請先選擇文件":"Select a document first","尚有資料未成功儲存，已取消匯出以避免漏掉批註":"Some changes are not saved; export canceled to avoid missing annotations.","無效的匯出檔名":"Invalid export filename","匯出資料夾名稱已被檔案佔用":"Export folder path is already a file","匯出檔案同名過多":"Too many export files with the same name","Noctilucent：已匯出 ":"Noctilucent: exported "," 筆標記至 ":" markers to ","Noctilucent：匯出失敗：":"Noctilucent: export failed: ","沒有可複製的批註":"No annotations to copy","已複製 ":"Copied "," 筆批註":" annotations","刪除這則區域批註？":"Delete this area annotation?","刪除這則自由批註？":"Delete this free note?","找不到原始 PDF":"Original PDF not found","無法精確定位批註；請確認 PDF 頁面已載入及旋轉方向。":"Cannot pinpoint annotation; check PDF page rendering and rotation.","無法開啟 PDF 批註位置":"Could not open PDF annotation location","介面語言":"Interface language","自動跟隨 Obsidian：所有中文語系使用繁體中文，其他語系使用英文；也可手動指定。":"Auto follows Obsidian: Chinese locales use Traditional Chinese; all others use English. You can also override it.","自動 — 跟隨 Obsidian":"Auto — Follow Obsidian","目前文件：":"Current document: "," 筆標記 · ":" markers · "," 則有文字批註":" with notes","儲存至 ":"Save to ","（同名時另存新版本）":" (creates a new version if the name exists)"," 個高亮 · ":" highlights · "," 則文字批註 · ":" notes · "," 則自由批註 · ":" free notes · "," 則區域批註":" area annotations","顯示 ":"Showing ","確定刪除「":"Delete all markers for “","」的全部 ":"”, a total of "," 筆高亮與批註？\n\n不會刪除原始文件。刪除前將另存完整 data.json 備份，並可於本次工作階段 Ctrl+Z 整批撤回。":" highlights and annotations?\n\nThe source file will remain untouched. A full data.json backup is created before deletion; Ctrl+Z can undo the batch in this session.","已刪除 ":"Deleted "," 筆。完整備份：":" markers. Full backup: ","（可 Ctrl+Z 撤回）":" (Ctrl+Z to undo)","目前文件有 ":"This document contains "," 則文字批註，同時展開可能使畫面擁擠或影響效能。確定全部展開？":" notes. Opening all cards may crowd the screen or reduce performance. Continue?","已展開 ":"Opened "," 則；另有 ":" notes; "," 則尚未載入或無法安全定位，未強制開啟。":" notes were not loaded or could not be located safely."," 則批註視窗":" annotation cards","切換為橫向工具列":"Switch to horizontal toolbar","縮小工具列為單一圖示":"Collapse toolbar to one icon","恢復直向工具列":"Restore vertical toolbar","切換工具列顯示方式":"Change toolbar layout","文件類型支援":"Document Support","PDF 批註":"PDF annotations","Markdown 閱讀模式批註":"Markdown Reading View annotations","Office Viewer 批註":"Office Viewer annotations","關閉後隱藏批註並停止此類文件的批註處理；原有資料保留。":"Disable annotation processing and display for this document type; existing data is retained.","匯出內容設定":"Export Preferences","匯出資料夾":"Export folder","Vault 內相對路徑，可使用巢狀資料夾；空白代表預設資料夾。":"Vault-relative path; nested folders are supported. Leave blank for the default folder.","無效的匯出資料夾路徑":"Invalid export folder path","原始文件連結":"Source document links","頁碼／位置資訊":"Page / location information","高亮原文":"Highlighted text","批註內容":"Annotation content","批註類型":"Annotation type","色票資訊":"Highlight color","建立時間":"Created time","修改時間":"Modified time","釘選狀態":"Pinned status","批註 ID":"Annotation ID","依匯出設定選擇包含的資訊。":"Include information selected in Export Preferences.","格式：Markdown（.md） · 全部標記 · 依匯出設定輸出欄位":"Format: Markdown (.md) · All markers · Fields follow Export Preferences","- 內容：依匯出設定選擇的資訊":"- Contents: fields selected in Export Preferences","- 建立時間：":"- Created: ","- 修改時間：":"- Modified: ","目前文件的批註功能已停用":"Annotations are disabled for this document","請先完成文字輸入及儲存，再切換模組。":"Finish composing and saving text before switching modules.","標記":"Marker","卡片":"Cards","報告":"Report","分區":"Sections","雙欄":"Parallel","矩陣":"Matrix","極簡雙欄":"Minimal","純 Markdown":"Plain","匯出版面":"Export layout","匯出分類":"Export grouping","依頁次＋釘選":"Page + pinned","依色票":"By color","黃色":"Yellow","橘色":"Orange","粉色":"Pink","綠色":"Green","藍色":"Blue","紫色":"Purple","青色":"Teal","灰色":"Gray","其他顏色":"Other colors","釘選":"Pinned","原文":"Original text","我的批註":"My annotation","位置":"Location","色票":"Color","無文字批註":"No written annotation","閱讀統計":"Reading statistics","色彩分布":"Color distribution","位置分布":"Location distribution","標記總數":"Total annotations","有文字批註":"With notes","已釘選":"Pinned","彩色標記":"Colored annotations","無彩色標記":"No colored annotations","投影片 ":"Slide ","EPUB 批註（ePub Reader）":"EPUB annotations (ePub Reader)","章節":"Chapter","章節順序":"Chapter order","依章節＋釘選":"Chapter + pinned","EPUB 連續高亮":"EPUB continuous highlighting","EPUB 高亮並批註":"EPUB highlight and comment","EPUB 自由筆記：點擊文字附近":"EPUB free note: click near text","EPUB 圖片區域高亮：在同一張圖片內拖曳":"EPUB image region: drag within one image","EPUB 橡皮擦：點擊標記":"EPUB eraser: click a mark","EPUB：請先選取文字":"EPUB: select text first","EPUB：區域高亮目前僅支援單張圖片":"EPUB: region highlights currently support a single image only","EPUB：請點擊文字附近":"EPUB: click near text","EPUB：請先使用 ePub Reader 開啟文件":"EPUB: open the book in ePub Reader first","EPUB：請手動切換至對應章節後再跳轉":"EPUB: navigate to the corresponding chapter manually, then retry"});
let noctilucentLocale='zh-TW';
const T=s=>noctilucentLocale==='en'?(I18N_EN[s]??s):s;
const resolveNoctilucentLocale=(preference,obsidianLanguage)=>{
 if(preference==='en')return 'en';
 if(preference==='zh-TW')return 'zh-TW';
 const locale=String(obsidianLanguage||'').trim().toLowerCase().replace(/_/g,'-');
 return locale==='zh'||locale.startsWith('zh-')?'zh-TW':'en';
};
const detectObsidianLocale=()=>{try{return require('obsidian').getLanguage?.()||'en';}catch{return 'en';}};
const localizedText=(text,from,to)=>{
 if(from===to)return text;
 const dict=I18N_EN;
 const source=from==='zh-TW'?dict:Object.fromEntries(Object.entries(dict).map(([zh,en])=>[en,zh]));
 const raw=String(text??'');
 if(Object.hasOwn(source,raw))return source[raw];
 if(from==='zh-TW'&&/^(?:Office|Markdown) 批註$/.test(raw))return raw.replace(/ 批註$/, ' annotation');
 if(from==='en'&&/^(?:Office|Markdown) annotation$/.test(raw))return raw.replace(/ annotation$/, ' 批註');
 // Dynamic card headings: translate fixed system prefixes, never user-authored text.
 for(const [a,b] of Object.entries(source).sort((x,y)=>y[0].length-x[0].length)){
  if(a.length>=4&&raw.startsWith(a)&&/^([\s·.:：/-]|\d|$)/u.test(raw.slice(a.length, a.length+1)))return b+raw.slice(a.length);
 }
 return raw;
};
const relocalizeCard=(card,from,to)=>{
 if(!card||from===to)return;
 const walk=el=>{
  if(el.nodeType===3){if(el.parentElement?.closest('.noctilucent-md-card-quote,.noctilucent-preview,.noctilucent-md-hover-preview'))return;el.nodeValue=localizedText(el.nodeValue,from,to);return;}
  if(el.nodeType!==1||el.matches('textarea,input,.noctilucent-card-quote'))return;
  for(const attr of ['title','aria-label','placeholder'])if(el.hasAttribute(attr))el.setAttribute(attr,localizedText(el.getAttribute(attr),from,to));
  for(const child of el.childNodes)walk(child);
 };walk(card);
};

class PerformanceSettings extends PluginSettingTab {
 constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
 display(){const p=this.plugin,c=this.containerEl;c.empty();
 c.createEl('h2',{text:T('介面語言')});
 new Setting(c).setName(T('介面語言')).setDesc(T('自動跟隨 Obsidian：所有中文語系使用繁體中文，其他語系使用英文；也可手動指定。')).addDropdown(d=>{
  d.addOption('auto',T('自動 — 跟隨 Obsidian'));d.addOption('en','English');d.addOption('zh-TW','繁體中文');
  d.setValue(p.languageMode||'auto').onChange(async value=>{await p.changeUILanguage(value);});
 });
 c.createEl('h2',{text:T('文件類型支援')});
 for(const [key,label] of Object.entries({pdf:'PDF 批註',markdown:'Markdown 閱讀模式批註',office:'Office Viewer 批註',epub:'EPUB 批註（ePub Reader）'}))new Setting(c).setName(T(label)).setDesc(T('關閉後隱藏批註並停止此類文件的批註處理；原有資料保留。')).addToggle(t=>t.setValue(p.moduleEnabled(key)).onChange(async v=>{t.setDisabled(true);try{await p.changeModule(key,v);}finally{t.setValue(p.moduleEnabled(key));t.setDisabled(false);}}));
 c.createEl('h2',{text:T('匯出內容設定')});
 new Setting(c).setName(T('匯出資料夾')).setDesc(T('Vault 內相對路徑，可使用巢狀資料夾；空白代表預設資料夾。')).addText(t=>{t.setValue(p.exportFolder());t.inputEl.addEventListener('change',()=>{try{p.db.exportFolder=p.validateExportFolder(t.getValue());p.save();t.setValue(p.exportFolder());}catch(e){new Notice(e.message);t.setValue(p.exportFolder());}});});
 for(const [key,label] of Object.entries(EXPORT_FIELDS))new Setting(c).setName(T(label)).addToggle(t=>t.setValue(p.exportFields()[key]).onChange(v=>{p.db.exportFields={...p.exportFields(),[key]:v};p.save();}));
 c.createEl('h2',{text:T('Noctilucent · 批註儲存')});
 const toggle=(name,desc,key)=>new Setting(c).setName(name).setDesc(desc).addToggle(t=>t.setValue(p.pref[key]).onChange(v=>p.changePreference(key,v)));
 toggle(T('自動儲存'),T('停止輸入後合併儲存；關閉時仍會在離開編輯器或其他資料操作時儲存。'),'auto');
 new Setting(c).setName(T('自動儲存延遲')).setDesc(T('持續輸入時最多約 5 秒提交一次（不含組字及磁碟等待）。')).addDropdown(d=>{for(const n of [300,500,1000,2000,3000])d.addOption(String(n),n+' ms');d.setValue(String(p.pref.delay)).onChange(v=>p.changePreference('delay',Number(v)));});
 toggle(T('手動儲存按鈕'),T('在批註編輯器顯示儲存按鈕；Ctrl+S 仍可使用。'),'button');toggle(T('儲存狀態'),T('顯示已儲存、等待、寫入或失敗。'),'status');
 c.createEl('h2',{text:T('PDF 文字擷取')});toggle(T('新高亮文字容錯'),T('僅在新增文字高亮時整理間距；不修復既有批註。未確認的控制字元顯示代碼，不猜測統計符號。'),'normalizeNew');
 toggle(T('實驗：字型感知符號還原'),T('僅新增高亮且有異常字元時執行。已驗證 PDF 依檔案 SHA-256 與原文上下文還原；其他 PDF 需原生介面提供可靠字形證據。'),'symbolRecovery');
 toggle(T('實驗：智慧高亮缺口接合'),T('僅接合選取範圍內含異常字元且相鄰同一行的小缺口；不重繪舊標記。'),'smartGeometry');
 new Setting(c).setName(T('立即儲存全部待寫入資料')).addButton(b=>b.setButtonText(T('儲存')).onClick(()=>p.flushSave()));}
}
class NoctilucentExportModal extends Modal {
 constructor(app,plugin,path,layout,group){super(app);this.plugin=plugin;this.path=path;this.layout=safeLayout(layout);this.group=safeGroup(group);this.busy=false;}
 onOpen(){
  const c=this.contentEl;c.empty();c.addClass('noctilucent-export-modal');
  c.createEl('h3',{text:T('匯出高亮與批註')});
  const items=this.plugin.db.items.filter(a=>a.path===this.path);
  c.createEl('p',{text:`${T('目前文件：')}${this.path}`});
  c.createEl('p',{text:`${items.length}${T(' 筆標記 · ')}${items.filter(a=>String(a.note||'').trim()).length}${T(' 則有文字批註')}`});
  c.createEl('p',{text:T('格式：Markdown（.md） · 全部標記 · 依匯出設定輸出欄位')});
  const layoutSetting=new Setting(c).setName(T('匯出版面')).addDropdown(d=>{for(const [v,t] of exportOptions())d.addOption(v,t);d.setValue(this.layout).onChange(v=>{this.layout=safeLayout(v);});});
  const groupSetting=new Setting(c).setName(T('匯出分類')).addDropdown(d=>{for(const [v,t] of exportGroupOptions())d.addOption(v,v==='page'&&this.path.toLowerCase().endsWith('.epub')?T('依章節＋釘選'):t);d.setValue(this.group).onChange(v=>{this.group=safeGroup(v);});});
  const label=c.createEl('label',{text:T('匯出檔名')});
  const name=c.createEl('input',{type:'text',cls:'noctilucent-export-name'});
  name.value=this.plugin.defaultExportName(this.path);label.appendChild(name);
  const pathHint=c.createEl('div',{cls:'noctilucent-side-muted'});
  const update=()=>{const base=this.plugin.safeExportName(name.value);pathHint.textContent=base?`${T('儲存至 ')}${this.plugin.exportFolder()==='/'?'':this.plugin.exportFolder()+'/'}${base}.md${T('（同名時另存新版本）')}`:T('請輸入有效的檔名');};
  name.addEventListener('input',update);update();
  c.createEl('p',{text:T('只建立新的匯出筆記；不更動原始文件或 Noctilucent 的 data.json。'),cls:'noctilucent-side-muted'});
  const row=c.createDiv({cls:'noctilucent-side-row'});
  const cancel=row.createEl('button',{text:T('取消')});cancel.onclick=()=>this.close();
  const confirm=row.createEl('button',{text:T('建立 Markdown'),cls:'mod-cta'});
  confirm.onclick=async()=>{
   if(this.busy)return;
   const base=this.plugin.safeExportName(name.value);
   if(!base){new Notice(T('請輸入有效的匯出檔名'));name.focus();return;}
   this.busy=true;confirm.disabled=true;cancel.disabled=true;name.disabled=true;const selects=c.querySelectorAll('select');for(const el of selects)el.disabled=true;
   const layout=this.layout,group=this.group;
   try{const file=await this.plugin.exportAnnotationsMarkdown(this.path,base,layout,group);if(file){this.plugin.setDocumentViewPref(this.path,{layout,group});this.close();}}
   finally{this.busy=false;confirm.disabled=false;cancel.disabled=false;name.disabled=false;for(const el of selects)el.disabled=false;}
  };
 }
 onClose(){this.contentEl.empty();}
}

class AnnotationSidebar extends ItemView {
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.path=null;this.locked=false;this.filter=-1;this.mode='all';this.order='page';this.compact=true;this.query='';this.searchScope='both';this.key='';this.bulkOpened=new Set();}
 getViewType(){return SIDEBAR;} getDisplayText(){return 'Noctilucent';} getIcon(){return 'stars';}
 async onOpen(){this.contentEl.empty();const d=this.contentEl.ownerDocument;this.root=d.createElement('div');this.root.className='noctilucent-sidebar';this.contentEl.append(this.root);
  const make=(tag,parent,text,cls)=>{const e=d.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;parent.append(e);return e;};this.make=make;
  const header=make('div',this.root,null,'noctilucent-side-row');make('strong',header,'Noctilucent');this.pin=make('button',header,T('鎖定文件'));this.pin.onclick=()=>{if(!this.path)return;this.locked=!this.locked;this.refresh(true);};
  this.file=make('div',this.root,'','noctilucent-side-file');this.stats=make('div',this.root,'','noctilucent-side-muted');
  const search=make('input',this.root);search.type='search';search.placeholder=T('搜尋原文或批註…');search.setAttribute('aria-label',T('搜尋原文或批註'));search.oninput=()=>{this.query=search.value;this.refresh(true);};
  const row=make('div',this.root,null,'noctilucent-side-row');const select=(parent,options,value,fn,label)=>{const e=make('select',parent);e.setAttribute('aria-label',label);for(const [v,t] of options){const o=make('option',e,t);o.value=v;}e.value=value;e.onchange=()=>fn(e.value);return e;};
  this.scope=select(row,[['both',T('原文＋批註')],['quote',T('僅原文')],['note',T('僅批註')]],this.searchScope,v=>{this.searchScope=v;this.refresh(true);},T('搜尋範圍'));
  select(row,[['all',T('全部')],['notes',T('有批註')],['highlights',T('純高亮')],['sticky',T('自由批註')],['area',T('區域批註')]],this.mode,v=>{this.mode=v;this.refresh(true);},T('批註篩選'));
  this.orderSelect=select(row,[['page',T('頁碼順序')],['color',T('依色票')],['recent',T('最新建立')]],this.order,v=>{this.order=v;this.plugin.setDocumentViewPref(this.path,{sidebarOrder:v});this.refresh(true);},T('排序'));
  const palette=make('div',this.root,null,'noctilucent-side-palette');this.filterBtns=[];for(const [i,c] of [[-1,''],...COLORS.entries()]){const b=make('button',palette,i===-1?T('全部'):'●');if(c)b.style.color=c;b.title=i===-1?T('全部顏色'):T('色票 ')+(i+1);b.setAttribute('aria-label',b.title);b.onclick=()=>{this.filter=this.filter===i?-1:i;this.refresh(true);};this.filterBtns.push([i,b]);}
  const actions=make('div',this.root,null,'noctilucent-side-row');this.layout=make('button',actions,T('詳細卡片'));this.layout.onclick=()=>{this.compact=!this.compact;this.refresh(true);};const copy=make('button',actions,T('複製全部'));copy.title=T('複製目前 PDF 的所有批註（含未篩選項目）');copy.onclick=()=>this.plugin.copyAnnotations(this.items());
  const bulk=make('div',this.root,null,'noctilucent-side-row noctilucent-side-bulk');
  this.expand=make('button',bulk,T('顯示預覽'));this.expand.onclick=()=>this.cycleNoteDisplay();
  this.clearAll=make('button',bulk,T('全部刪除…'));this.clearAll.className='noctilucent-side-delete-all';this.clearAll.title=T('備份後刪除目前文件全部標記，不受搜尋或篩選影響');this.clearAll.onclick=()=>this.plugin.deleteAllForDocument(this.path);
   const exportRow=make('div',this.root,null,'noctilucent-side-row');this.exportButton=make('button',exportRow,T('匯出高亮與批註…'));this.exportButton.className='noctilucent-side-export';this.exportButton.title=T('將目前文件全部標記（不受搜尋與顏色篩選影響）匯出成獨立 Markdown 筆記');this.exportButton.onclick=()=>this.plugin.openExportDialog(this.path);
  this.count=make('div',this.root,'','noctilucent-side-muted');this.list=make('div',this.root,null,'noctilucent-side-list');this.root.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable=true]')||e.isComposing||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey)||!this.path)return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopPropagation();if(!e.repeat)(k==='z'?this.plugin.undoHighlight(this.path):this.plugin.redoHighlight(this.path));}});this.refresh(true);}
 items(){return this.plugin.pathEnabled(this.path)?this.plugin.db.items.filter(a=>a.path===this.path):[];}
 stopNotePreviews(){
  if(this.notePreviewTimer!=null)clearInterval(this.notePreviewTimer);this.notePreviewTimer=null;
  for(const tip of this.notePreviewNodes?.values()||[])tip.remove();this.notePreviewNodes?.clear();
  this.syncNoteDisplayButton();
 }
 toggleNotePreviews(){
  if(this.notePreviewTimer!=null){this.stopNotePreviews();return;}
  if(!this.path||!this.plugin.pathEnabled(this.path))return;
  this.notePreviewNodes=new Map();this.notePreviewTimer=setInterval(()=>this.syncNotePreviews(),150);
  this.syncNoteDisplayButton();this.syncNotePreviews();
 }
 syncNotePreviews(){
  const p=this.plugin,path=this.path;if(!this.root?.isConnected||!p.pathEnabled(path)){this.stopNotePreviews();return;}
  const notes=p.db.items.filter(a=>a.path===path&&String(a.note||'').trim()),seen=new Set();
  const pdf=[...p.views.values()].find(v=>v.path===path&&v.root.getClientRects().length);
  const md=[...p.mdViews.values()].find(v=>v.path===path&&v.root.getClientRects().length);
  const epub=[...p.epubAdapter?.views.values()||[]].find(v=>v.path===path&&v.root.getClientRects().length);
  for(const a of notes){
   let v,el,host,clip;
   if(epubType(a)){v=epub;const frame=v&&[...v.frames.values()].find(s=>s.marks.has(a.id)&&s.layer.style.visibility!=='hidden');el=frame?.marks.get(a.id);host=v?.root;clip=frame?.frame.getBoundingClientRect();}
   else if(['markdown-highlight','office-highlight'].includes(a.type)){v=md;el=v?.officeMarkers?.get(a.id)?.button;host=v?.root;clip=v?.reading.getBoundingClientRect();}
   else{v=pdf;el=v&&p.marker(v,a);host=v&&p.ensureOverlay(v);}
   if(!el?.isConnected||!host?.isConnected||v.cards?.has(a.id)||!el.getClientRects().length||el.style.visibility==='hidden')continue;
   if(v.mdPreview?.dataset.annotationId===a.id||v.preview&&v.previewId===a.id)continue;
   const r=p.rootRect(v,el),h=host.getBoundingClientRect();
   if(!r.width||!r.height||r.bottom<=Math.max(h.top,clip?.top??h.top)||r.top>=Math.min(h.bottom,clip?.bottom??h.bottom)||r.right<=Math.max(h.left,clip?.left??h.left)||r.left>=Math.min(h.right,clip?.right??h.right))continue;
   let tip=this.notePreviewNodes.get(a.id);if(tip?.parentElement!==host){tip?.remove();tip=null;}
   if(!tip){tip=host.ownerDocument.createElement('div');tip.className='noctilucent-md-hover-preview noctilucent-bulk-note-preview';tip.setAttribute('role','note');host.append(tip);this.notePreviewNodes.set(a.id,tip);}
   if(tip.textContent!==a.note)tip.textContent=a.note;
   const w=tip.offsetWidth,z=tip.offsetHeight,clamp=(x,max)=>Math.max(0,Math.min(x,Math.max(0,max)));
   const x=clamp(r.right-h.left+5,h.width-w),y=clamp(r.bottom-h.top+5+z<=h.height?r.bottom-h.top+5:r.top-h.top-z-5,h.height-z);
   const left=x+'px',top=y+'px';if(tip.style.left!==left)tip.style.left=left;if(tip.style.top!==top)tip.style.top=top;seen.add(a.id);
  }
  for(const [id,tip] of this.notePreviewNodes)if(!seen.has(id)){tip.remove();this.notePreviewNodes.delete(id);}
 }
 syncNoteDisplayButton(){if(!this.expand)return;const preview=this.notePreviewTimer!=null,cards=this.bulkOpened.size>0;this.expand.textContent=T(cards?'收合卡片':preview?'展開卡片':'顯示預覽');this.expand.setAttribute('aria-pressed',String(preview||cards));this.expand.title=T(cards?'收合卡片':preview?'展開卡片':'顯示預覽');}
 async cycleNoteDisplay(){if(this.displayBusy||!this.path)return;this.displayBusy=true;const path=this.path;try{if(this.bulkOpened.size){const ids=this.bulkOpened;this.bulkOpened=new Set();this.plugin.closeBulkCards(path,ids);}else if(this.notePreviewTimer!=null){this.stopNotePreviews();const opened=await this.plugin.openBulkCards(path);if(this.path===path&&this.root?.isConnected)this.bulkOpened=opened;else this.plugin.closeBulkCards(path,opened);}else this.toggleNotePreviews();}finally{this.displayBusy=false;this.refresh(true);}}
 async toggleBulkCards(){if(!this.path)return;if(this.bulkOpened.size){this.plugin.closeBulkCards(this.path,this.bulkOpened);this.bulkOpened.clear();this.refresh(true);return;}this.bulkOpened=await this.plugin.openBulkCards(this.path);this.refresh(true);}
 refresh(force=false){if(!this.root)return;const old=this.path;if(!this.locked)this.path=this.plugin.sidebarPath();if(old!==this.path){this.stopNotePreviews();if(this.bulkOpened.size){const ids=this.bulkOpened;this.bulkOpened=new Set();this.plugin.closeBulkCards(old,ids);}}const prefs=this.plugin.documentViewPref(this.path);this.order=prefs.sidebarOrder;this.orderSelect.value=this.order;const pageOption=[...this.orderSelect.options].find(o=>o.value==='page');if(pageOption)pageOption.textContent=this.path?.toLowerCase().endsWith('.epub')?T('章節順序'):T('頁碼順序');this.orderSelect.disabled=!this.path;const activeEditor=this.root.ownerDocument.activeElement;if(!force&&old===this.path&&activeEditor?.classList.contains('noctilucent-side-editor')&&this.list.contains(activeEditor))return;if(!force&&old===this.path&&this.seenRev===this.plugin.sideRev)return;this.seenRev=this.plugin.sideRev;const all=this.items();const q=this.query.trim().toLowerCase();const items=all.filter(a=>(this.filter===-1||String(a.color).toLowerCase()===COLORS[this.filter].toLowerCase())&&(this.mode==='all'||(this.mode==='area'?area(a):this.mode==='sticky'?sticky(a):this.mode==='notes'?!!String(a.note||'').trim():!special(a)&&!String(a.note||'').trim()))&&(!q||(this.searchScope==='quote'?(area(a)?T('區域批註'):sticky(a)?T('自由批註'):quoteText(a)):this.searchScope==='note'?String(a.note||''):`${area(a)?T('區域批註 area highlight'):sticky(a)?T('自由批註 sticky note'):quoteText(a)} ${a.note||''}`).toLowerCase().includes(q)));if(this.order==='color'||this.order==='page'){const sorted=this.plugin.exportSort(items,this.path||'');if(this.order==='color')sorted.sort((a,b)=>(exportColorIndex(a)+9)%9-(exportColorIndex(b)+9)%9);else sorted.sort((a,b)=>{const ap=Number(a.pinnedAt)||0,bp=Number(b.pinnedAt)||0;return (!!ap!==!!bp)?(ap?-1:1):(ap&&bp?ap-bp:0);});for(let i=0;i<sorted.length;i++)items[i]=sorted[i];}else items.sort((a,b)=>{const ap=Number(a.pinnedAt)||0,bp=Number(b.pinnedAt)||0;if(!!ap!==!!bp)return ap?-1:1;if(ap&&bp&&ap!==bp)return ap-bp;return (b.created||0)-(a.created||0);});
 this.file.textContent=this.path?this.path.split('/').at(-1):T('請先開啟 PDF 或 Markdown');this.file.title=this.path||'';this.stats.textContent=`${all.filter(a=>!special(a)).length}${T(' 個高亮 · ')}${all.filter(a=>!special(a)&&String(a.note||'').trim()).length}${T(' 則文字批註 · ')}${all.filter(sticky).length}${T(' 則自由批註 · ')}${all.filter(area).length}${T(' 則區域批註')}`;this.count.textContent=`${T('顯示 ')}${items.length} / ${all.length}${T(' 筆')}`;this.pin.textContent=this.locked?T('解除鎖定'):T('鎖定文件');this.pin.disabled=!this.path;this.pin.setAttribute('aria-pressed',String(this.locked));this.expand.disabled=!this.path||!all.some(a=>String(a.note||'').trim());this.clearAll.disabled=!this.path||!all.length;this.exportButton.disabled=!this.path||!all.length;if(this.expand.disabled&&this.notePreviewTimer!=null)this.stopNotePreviews();this.syncNoteDisplayButton();this.layout.textContent=this.compact?T('詳細卡片'):T('緊湊清單');for(const [i,b] of this.filterBtns)b.setAttribute('aria-pressed',String(i===this.filter));
 const key=JSON.stringify([this.path,this.compact,this.order,items.map(a=>[a.id,a.page,a.color,a.text,a.normalizedText,a.normalizationStatus,a.note,a.modified,a.created,a.pinnedAt,point(a)])]);if(!force&&key===this.key)return;const active=this.root.ownerDocument.activeElement;if(!force&&old===this.path&&active?.classList.contains('noctilucent-side-editor')&&this.list.contains(active))return;this.key=key;const scroll=this.list.scrollTop;this.plugin.releaseEditors(this.list);this.list.replaceChildren();if(!items.length){this.make('div',this.list,this.path?T('沒有符合條件的批註'):T('開啟 PDF 或 Markdown 閱讀模式後會自動顯示批註'),'noctilucent-side-muted');return;}
 let page=null;for(const a of items){if(this.order==='color'){const ci=exportColorIndex(a);if(page!==ci){page=ci;const h=this.make('div',this.list,exportColorName(a)+' · '+items.filter(x=>exportColorIndex(x)===ci).length+T(' 筆'),'noctilucent-side-group');if(ci>=0){const dot=this.make('span',h,'●','noctilucent-export-group-dot');dot.style.color=COLORS[ci];h.prepend(dot);}}}else if(Number(a.pinnedAt)>0){if(page!=='pinned'){page='pinned';this.make('div',this.list,T('📌 已釘選 · ')+items.filter(x=>Number(x.pinnedAt)>0).length+T(' 筆'),'noctilucent-side-group');}}else if(this.order==='page'){const location=this.plugin.localizedExportLocation(a);if(page!==location){page=location;this.make('div',this.list,location+' · '+items.filter(x=>this.plugin.localizedExportLocation(x)===location&&!x.pinnedAt).length+T(' 筆'),'noctilucent-side-group');}}this.renderItem(a);}this.list.scrollTop=old===this.path?scroll:0;}
 renderItem(a){const m=this.make,card=m('div',this.list,null,'noctilucent-side-item');card.dataset.annotationId=a.id;card.style.borderInlineStartColor=a.color;const head=m('div',card,null,'noctilucent-side-row');m('span',head,a.type==='markdown-highlight'?'MD':a.type==='office-highlight'?'Office':epubType(a)?epubChapterLabel(a):'p. '+a.page,'noctilucent-side-muted');const button=(parent,label,title,fn)=>{const b=m('button',parent,label);b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;};const pinned=!!a.pinnedAt;const pinButton=button(head,pinned?'📌':'♧',pinned?T('取消釘選'):T('釘選置頂（每份文件最多 3 筆）'),()=>this.plugin.toggleAnnotationPin(a.id));pinButton.className='noctilucent-side-pin';pinButton.setAttribute('aria-pressed',String(pinned));button(head,'↗',T('跳到原文'),()=>this.plugin.jumpAnnotation(a.id));button(head,T('編輯'),T('編輯批註'),()=>{editor.hidden=!editor.hidden;note.hidden=!editor.hidden;saveUI.row.hidden=editor.hidden;if(!editor.hidden)editor.focus();else this.plugin.flushSave();});button(head,'●',T('更改標記顏色'),()=>{palette.hidden=!palette.hidden;});button(head,T('複製'),area(a)?T('複製區域圖片及批註'):T('複製原文及批註'),()=>area(a)?(epubType(a)?this.plugin.epubAdapter.copyRegion(a.id):this.plugin.copyAreaWithNote(a.id)):this.plugin.copyAnnotations([a]));button(head,'×',T('刪除標記與批註'),()=>this.plugin.deleteFromSidebar(a.id));
 const quote=m('button',card,area(a)?T('區域批註'):sticky(a)?T('自由批註'):quoteText(a)||T('（無原文）'),'noctilucent-side-quote'+(this.compact?' is-compact':''));if(special(a)){const glyph=quote.ownerDocument.createElement('span');glyph.className='noctilucent-side-sticky-icon';setIcon(glyph,area(a)?'scan':'sticky-note');quote.prepend(glyph);}quote.title=T('跳到原文')+(quoteWarning(a)?'｜'+quoteWarning(a):'');if(a.normalizationStatus==='unresolved')m('div',card,quoteWarning(a),'noctilucent-side-muted');quote.onclick=()=>this.plugin.jumpAnnotation(a.id);
 const note=m('div',card,a.note||'', 'noctilucent-side-note'+(this.compact?' is-compact':''));const editor=m('textarea',card,null,'noctilucent-side-editor');editor.hidden=true;editor.value=a.note||'';editor.placeholder=T('輸入批註（自動儲存）');editor.setAttribute('aria-label',T('編輯')+((['markdown-highlight','office-highlight'].includes(a.type)||epubType(a))?T(' 文件'):T('第 ')+a.page+T(' 頁'))+T('批註'));const saveUI=this.plugin.bindEditor(editor,a,card);saveUI.row.hidden=true;editor.addEventListener('blur',()=>{if(saveUI.composing)return;note.textContent=editor.value;editor.hidden=true;saveUI.row.hidden=true;note.hidden=false;setTimeout(()=>{if(this.root)this.refresh();},180);});
 const palette=m('div',card,null,'noctilucent-side-palette');palette.hidden=true;for(const c of COLORS){const b=button(palette,'●',T('改色 ')+c,()=>this.plugin.colorFromSidebar(a.id,c));b.style.color=c;b.setAttribute('aria-pressed',String(a.color===c));}}
 async onClose(){this.stopNotePreviews();this.plugin.flushSave();this.plugin.releaseEditors(this.root);this.root?.remove();this.root=null;}
}

module.exports=class extends Plugin {
 // v0.1.6: Markdown Reading View adapter. All annotations are stored in plugin data.json.
 // Never modify the Markdown source nor the rendered text nodes.
 // Only reading surfaces. Homepage.md is a dashboard, never an annotation surface.
 moduleEnabled(key){return key==='epub'?this.db.documentSupport?.epub===true:this.db.documentSupport?.[key]!==false;}
 pathEnabled(path){const ext=String(path||'').split('.').at(-1).toLowerCase();return this.moduleEnabled(ext==='pdf'?'pdf':ext==='md'?'markdown':['docx','pptx'].includes(ext)?'office':ext==='epub'?'epub':'unknown');}
 async changeModule(key,value){
  if(this.moduleChanging)return;this.moduleChanging=true;
  try{if([...this.editors.values()].some(x=>x.composing)){new Notice(T('請先完成文字輸入及儲存，再切換模組。'));return;}
   for(const [el,x] of this.editors)if(el.isConnected)this.updateNote(x.id,el.value,el);
   if(!await this.flushSave())return;
   const old=this.db.documentSupport;this.db.documentSupport={...old,[key]:value};this.save();
   if(!await this.flushSave()){this.db.documentSupport=old;this.save();return;}
   if(!value){if(key==='pdf'){this.mode=false;this.snap=null;this.cancelSticky();this.cancelArea();}else{if(this.mdSelection&&!this.pathEnabled(this.mdSelection.path))this.mdSelection=null;if(!this.moduleEnabled('markdown')&&!this.moduleEnabled('office'))this.mdMode=false;}if(this.eraserTarget&&!this.pathEnabled(this.eraserTarget.path)){this.eraserGesture?.cleanup?.();this.eraserGesture=null;this.eraserTarget=null;}}
   this.scan();this.mdRefresh();this.refreshEraserUI();for(const l of this.app.workspace.getLeavesOfType(SIDEBAR)){if(!this.pathEnabled(l.view.path))l.view.bulkOpened?.clear();l.view.refresh?.(true);}
  }finally{this.moduleChanging=false;}
 }
 documentViewPref(path){const raw=path&&Object.hasOwn(this.db.documentViewPrefs||{},path)?this.db.documentViewPrefs[path]:{};return {layout:safeLayout(raw?.layout),group:safeGroup(raw?.group),sidebarOrder:['page','color','recent'].includes(raw?.sidebarOrder)?raw.sidebarOrder:'page'};}
 setDocumentViewPref(path,patch){if(!path)return;const next={...this.documentViewPref(path),...patch};this.db.documentViewPrefs={...this.db.documentViewPrefs,[path]:next};this.save();}
 exportFields(){return {...DEFAULT_EXPORT,...this.db.exportFields};}
 validateExportFolder(raw){const v=String(raw||'').trim().replace(/\\/g,'/');if(!v)return 'Noctilucent Exports';if(v==='/')return '/';if(v.startsWith('/')||/[:*?"<>|\x00-\x1f]/.test(v)||v.split('/').some(x=>x==='..'||x==='.'||x.toLowerCase()==='.obsidian'||x.toLowerCase()==='.trash'))throw Error(T('無效的匯出資料夾路徑'));return normalizePath(v);}
 exportFolder(){return this.validateExportFolder(this.db.exportFolder);}
 mdReadingLeaf(leaf){
  const view=leaf?.view,path=view?.file?.path||view?.getState?.()?.file;
  if(!path||typeof path!=='string'||!this.pathEnabled(path))return null;
  const root=view?.containerEl;
  if(!root)return null;
  if(view.getViewType?.()==='markdown'){
   // Exclude dashboard homepages regardless of an emoji-prefixed basename,
   // theme-specific CSS class, or Homepage plugin tab title.
   const basename=path.split('/').pop().replace(/\.md$/i,'').trim();
   const title=(view.getDisplayText?.()||'').trim();
   const homeName=x=>/^(?:[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+)?homepage$/iu.test(x);
   const meta=this.app.metadataCache.getCache(path)?.frontmatter;
   if(view.getMode?.()!=='preview'||homeName(basename)||homeName(title)||String(meta?.type||'').toLowerCase()==='homepage'||String(meta?.cssclasses||'').split(/\s+/).includes('pc-homepage'))return null;
   const reading=root.querySelector('.markdown-reading-view');
   if(!reading||reading.closest('.markdown-source-view')||!reading.getClientRects().length)return null;
   return {leaf,root,reading,body:reading.querySelector('.markdown-preview-sizer')||reading,path,kind:'markdown'};
  }
  // Office Viewer v0.2.x compatibility preview. Never attach to an embedded Office
  // widget in a Markdown editor, and never edit source DOCX/PPTX bytes.
  if(!/\.(docx|pptx)$/i.test(path)||view.getViewType?.()==='markdown')return null;
  const reading=root.querySelector('.view-content');
  if(!reading||!reading.getClientRects().length)return null;
  // Office Viewer owns this leaf. Prefer its document/slides content over controls.
  const ppt=path.toLowerCase().endsWith('.pptx');
  // Official Office Viewer uses .pptx-viewer__slide for the live slide. Never
  // search the thumbnail rail, slide search panel, or speaker notes.
  const body=ppt?reading.querySelector('.pptx-viewer__slide'):reading.querySelector('.office-viewer-docx-reading-body,.office-viewer-document,.office-viewer-content,.docx-wrapper,.docx-container');
  if(!body)return null;
  if(!ppt&&!body.querySelector('p,li,h1,h2,h3,h4,h5,h6,td,th,figcaption,svg text'))return null;
  if(!reading.ownerDocument.defaultView?.CSS?.highlights||!reading.ownerDocument.defaultView?.Highlight)return null;
  return {leaf,root,reading,body,path,kind:ppt?'pptx':'office'};
 }
 mdLeaves(){const leaves=[];this.app.workspace.iterateAllLeaves(leaf=>{if(leaf?.view?.containerEl)leaves.push(leaf);});return leaves;}
 mdKind(v){return v?.kind==='epub'?'EPUB':['office','pptx'].includes(v?.kind)?'Office':'Markdown';}
 mdSlideKey(v,lookup=null){if(v?.kind!=='pptx')return null;const t=(lookup?.blocks||this.mdBlocks(v.body)).map(b=>this.mdBlockText(b,lookup)).join('\u001e');let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16)+':'+t.length;}
 // Office Viewer uses its own slide navigation controls. Inspect DOM only; do
 // not import another plugin's internal state or change the presentation bytes.
 mdPptControls(v){const host=v?.root?.querySelector?.('.pptx-viewer')||v?.reading?.querySelector?.('.pptx-viewer');if(!host)return null;const input=host.querySelector('[data-action="page-number"]'),jump=host.querySelector('[data-action="jump-to-slide"]');return {host,input,jump};}
 mdPptSlideNumber(v){const controls=this.mdPptControls(v);const n=Number(controls?.input?.value);return Number.isSafeInteger(n)&&n>=1?n:null;}
 mdPptSlideCount(v){const controls=this.mdPptControls(v);if(!controls)return null;const upper=Number(controls.input?.max);if(Number.isSafeInteger(upper)&&upper>=1)return upper;const text=controls.host.querySelector('.pptx-viewer__page-jump')?.textContent||'';const m=text.match(/\b(\d+)\s*\/\s*(\d+)\b/);const n=m?Number(m[2]):NaN;return Number.isSafeInteger(n)&&n>=1?n:null;}
 async mdPptNavigate(v,slide,expectedKey=null){
  const controls=this.mdPptControls(v);if(!controls?.input||!controls.jump||!Number.isSafeInteger(slide)||slide<1)return false;
  const old=this.mdSlideKey(v),input=controls.input;
  try{
   const proto=input.ownerDocument.defaultView?.HTMLInputElement?.prototype;
   const setter=proto&&Object.getOwnPropertyDescriptor(proto,'value')?.set;
   if(setter)setter.call(input,String(slide));else input.value=String(slide);
   input.dispatchEvent(new input.ownerDocument.defaultView.Event('input',{bubbles:true}));
   input.dispatchEvent(new input.ownerDocument.defaultView.Event('change',{bubbles:true}));
   controls.jump.click();
  }catch(e){console.warn('Noctilucent PPT slide navigation failed',e);return false;}
  // A slide render may replace the text nodes. Wait only on explicit jump;
  // never poll in the background or guess that a different slide is a match.
  for(let attempt=0;attempt<16;attempt++){
   await new Promise(resolve=>setTimeout(resolve,90));
   const live=this.mdReadingLeaf(v.leaf);if(!live||live.path!==v.path||live.kind!=='pptx')return false;
   const key=this.mdSlideKey(live);const number=this.mdPptSlideNumber(live);
   if(number===slide&&(!expectedKey||key===expectedKey))return true;
   if(number===slide&&key!==old&&expectedKey&&attempt>=2)return false;
   if(number===slide&&key!==old&&!expectedKey)return true;
  }
  return false;
 }

 mdBlock(node,body){
  let el=node?.nodeType===1?node:node?.parentElement;
  const selector='p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption,svg text';
  let block=el?.closest?.(selector);
  if(body.classList?.contains('pptx-viewer__slide'))block=this.mdBlocks(body).find(b=>b.contains(node))||null;
  if(!block||!body.contains(block)||block.closest('pre,code,.noctilucent-md-bar,.noctilucent-md-card,.office-viewer-toolbar,.office-viewer-search'))return null;
  if(block.tagName==='LI'&&block.querySelector(':scope > p'))return block.querySelector(':scope > p');
  // A nested paragraph is preferable to its encompassing list-item.
  return block;
 }
 // Markdown code anchors use a separate namespace so existing paragraph ordinals
 // and Office slide fingerprints are never changed by newly supported code.
 mdCodeBlock(node,body){
  const el=node?.nodeType===1?node:node?.parentElement,block=el?.closest?.('code');
  if(!block||!body.contains(block)||block.closest('button,input,textarea,.noctilucent-md-bar,.noctilucent-md-card,.math,.math-block,.mermaid,.block-language-mermaid,.cm-editor,.markdown-source-view'))return null;
  if(block.closest('pre')&&block.parentElement?.tagName!=='PRE')return null;
  return block;
 }
 mdCodeBlocks(body){return [...body.querySelectorAll('code')].filter(b=>this.mdCodeBlock(b,body)===b&&this.mdNodes(b).length>0);}
 mdCodeOffset(block,node,offset){
  if(node.nodeType===3)return this.mdOffset(block,node,offset);
  if(node.nodeType!==1||!block.contains(node))return -1;
  const range=block.ownerDocument.createRange();range.setStart(block,0);range.setEnd(node,offset);
  return range.toString().length;
 }
 mdNodes(block,lookup=null){
  const cache=lookup?.nodes,hit=cache?.get(block);if(hit)return hit;
  const d=block.ownerDocument,walker=d.createTreeWalker(block,4),nodes=[];
  while(walker.nextNode()){
   const n=walker.currentNode;
   if(!n.textContent||n.parentElement?.closest(block.tagName==='CODE'?'button,input,textarea,.copy-code-button,.noctilucent-md-bar,.noctilucent-md-card,.math,.math-block':'pre,code,.noctilucent-md-bar,.noctilucent-md-card,.math,.math-block'))continue;
   nodes.push(n);
  }
  cache?.set(block,nodes);return nodes;
 }
 mdBlockText(block,lookup=null){if(lookup?.texts?.has(block))return lookup.texts.get(block);const text=this.mdNodes(block,lookup).map(x=>x.textContent).join('');lookup?.texts?.set(block,text);return text;}
 mdOffset(block,node,offset){
  let count=0;
  for(const n of this.mdNodes(block)){
   if(n===node)return count+offset;
   count+=n.textContent.length;
  }
  return -1;
 }
 mdRange(block,start,end,lookup=null){
  const nodes=this.mdNodes(block,lookup);let cursor=0,first=null,last=null;
  for(const n of nodes){const length=n.textContent.length;
   if(first===null&&start>=cursor&&start<cursor+length)first=[n,start-cursor];
   if(end>cursor&&end<=cursor+length){last=[n,end-cursor];break;}
   cursor+=length;
  }
  if(!first||!last)return null;
  const range=block.ownerDocument.createRange();range.setStart(...first);range.setEnd(...last);return range;
 }
 mdBlocks(body,lookup=null){
  if(body.classList?.contains('pptx-viewer__slide')){
   // A PPTX slide may be rendered as HTML spans/divs or SVG text. Restrict to
   // text-bearing leaf blocks, never the entire slide or toolbar controls.
   return [...body.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,td,th,figcaption,svg text,span,div')].filter(b=>{
    if(b.closest('pre,code,button,input,textarea,.noctilucent-md-bar,.noctilucent-md-card'))return false;
    if(b.tagName==='DIV'||b.tagName==='SPAN'){
     const direct=[...b.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
     if(!direct)return false;
    }else if(b.querySelector('p,li,h1,h2,h3,h4,h5,h6,td,th,figcaption,svg text'))return false;
    return this.mdNodes(b,lookup).length>0&&this.mdBlockText(b,lookup).trim().length>0;
   });
  }
  return [...body.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption,svg text')].filter(b=>!b.closest('pre,code,.noctilucent-md-bar,.noctilucent-md-card')&&!b.querySelector('p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption')&&this.mdNodes(b,lookup).length>0);}
 mdCapture(d){
  const sel=d.getSelection?.();if(!sel||sel.isCollapsed||sel.rangeCount!==1)return null;
  const r=sel.getRangeAt(0);if(r.collapsed||r.toString().length>3000)return null;
  const leaf=this.mdLeaves().find(l=>l.view.containerEl.contains(r.commonAncestorContainer));
  const v=this.mdReadingLeaf(leaf);if(!v)return null;
  const c1=v.kind==='markdown'?this.mdCodeBlock(r.startContainer,v.body):null,c2=v.kind==='markdown'?this.mdCodeBlock(r.endContainer,v.body):null;
  if((c1||c2)&&c1!==c2)return null;
  const b1=c1||this.mdBlock(r.startContainer,v.body),b2=c2||this.mdBlock(r.endContainer,v.body);
  if(!b1||b1!==b2)return null;
  const start=c1?this.mdCodeOffset(b1,r.startContainer,r.startOffset):this.mdOffset(b1,r.startContainer,r.startOffset),end=c1?this.mdCodeOffset(b1,r.endContainer,r.endOffset):this.mdOffset(b1,r.endContainer,r.endOffset);
  if(start<0||end<=start)return null;
  const all=this.mdBlockText(b1),quote=all.slice(start,end);
  if(!quote.trim()||quote!==r.toString())return null;
  const blocks=c1?this.mdCodeBlocks(v.body):this.mdBlocks(v.body),ordinal=blocks.indexOf(b1);
  if(ordinal<0)return null;
  const anchor={version:1,block:ordinal,quote,start,prefix:all.slice(Math.max(0,start-48),start),suffix:all.slice(end,end+48)};
  if(c1){anchor.code=true;
   // Fractional order places new code annotations between legacy paragraph
   // ordinals without renumbering any existing annotation.
   const preceding=this.mdBlocks(v.body).filter(b=>b.compareDocumentPosition(c1)&4).length;
   anchor.codeOrder=preceding-1+(ordinal+1)/(blocks.length+1);
  }
  if(v.kind==='pptx'){anchor.slideKey=this.mdSlideKey(v);const number=this.mdPptSlideNumber(v);if(number)anchor.slideNumber=number;} // keep the original content fingerprint for safety
  return {path:v.path,anchor,quote,leaf,rect:r.getBoundingClientRect()};
 }
 // Perf: one DOM pass (blocks, text nodes, text) shared by every anchor resolved in the same synchronous pass.
 mdLookup(v){const lookup={blocks:null,texts:new Map(),nodes:new Map()};lookup.blocks=this.mdBlocks(v.body,lookup);if(v.kind==='pptx')lookup.slideKey=this.mdSlideKey(v,lookup);return lookup;}
 mdFindRange(v,a,lookup=null){
  const anchor=a.mdAnchor;
  if(!anchor?.quote)return null;
  if(v.kind==='pptx'&&(!anchor.slideKey||anchor.slideKey!==(lookup?.slideKey??this.mdSlideKey(v))))return null;
  if(anchor.code&&v.kind!=='markdown')return null;
  const blocks=anchor.code?(lookup?(lookup.codeBlocks??=this.mdCodeBlocks(v.body)):this.mdCodeBlocks(v.body)):(lookup?.blocks||this.mdBlocks(v.body)),quote=anchor.quote;
  // Most unchanged notes return immediately; avoid a full-document pass on
  // each decoration or scroll refresh.
  const original=blocks[anchor.block];
  if(original&&Number.isInteger(anchor.start)&&anchor.start>=0){
   const t=this.mdBlockText(original,lookup),end=anchor.start+quote.length;
   if(t.slice(anchor.start,end)===quote&&
      t.slice(Math.max(0,anchor.start-48),anchor.start)===String(anchor.prefix||'')&&
      t.slice(end,end+48)===String(anchor.suffix||''))
    return this.mdRange(original,anchor.start,end,lookup);
  }
  // Re-anchor by the unchanged selected text, not by an immutable 48-character
  // prefix/suffix. Edits beside the text or paragraph insertions can move it.
  // Ambiguous repeated text stays unbound rather than attaching to a wrong quote.
  const prefix=String(anchor.prefix||''),suffix=String(anchor.suffix||'');
  const context=(actual,old,reverse)=>{
   const limit=Math.min(48,actual.length,old.length);let n=0;
   while(n<limit&&(reverse?actual[actual.length-1-n]===old[old.length-1-n]:actual[n]===old[n]))n++;
   return n;
  };
  const results=[];let budget=0;
  for(let i=0;i<blocks.length;i++){
   const text=this.mdBlockText(blocks[i],lookup);budget+=text.length;
   if(budget>250000||results.length>=80)break;
   let at=text.indexOf(quote);
   while(at!==-1&&results.length<80){
    const before=text.slice(Math.max(0,at-48),at),after=text.slice(at+quote.length,at+quote.length+48);
    const left=context(before,prefix,true),right=context(after,suffix,false);
    const nearBlock=Math.abs(i-(Number.isInteger(anchor.block)?anchor.block:0));
    const nearOffset=Math.abs(at-(Number.isInteger(anchor.start)?anchor.start:0));
    const matched=left+right;
    // Strong context matters more than old ordinal; old ordinal is only a tie breaker.
    const score=matched*10+Math.min(14,Math.floor(quote.length/5))+
       (nearBlock===0?7:nearBlock===1?3:0)+(nearOffset===0?2:0);
    results.push({block:blocks[i],at,score,matched,nearBlock});
    at=text.indexOf(quote,at+Math.max(1,quote.length));
   }
  }
  if(!results.length)return null;
  results.sort((a,b)=>b.score-a.score||a.nearBlock-b.nearBlock);
  const best=results[0],next=results[1];
  // A globally unique, meaningful quote survives edits elsewhere even when both
  // contexts changed. Short snippets require corroborating context.
  if(!next){
   if(quote.trim().length<8&&best.matched<Math.min(6,prefix.length+suffix.length))return null;
   return this.mdRange(best.block,best.at,best.at+quote.length,lookup);
  }
  // Repeated quotations: require corroborating context AND a clear lead.
  if(best.matched<Math.min(8,prefix.length+suffix.length)||
     best.score-next.score<15)return null;
  return this.mdRange(best.block,best.at,best.at+quote.length,lookup);
 }
 mdScheduleRefresh(frame=false){if(frame){if(this.mdRefreshPending||this.mdRefreshFrame!=null)return;const win=this.app.workspace.containerEl?.ownerDocument?.defaultView||window;this.mdRefreshFrame=win.requestAnimationFrame(()=>{this.mdRefreshFrame=null;this.mdScheduleRefresh();});return;}if(this.mdRefreshFrame!=null){const win=this.app.workspace.containerEl?.ownerDocument?.defaultView||window;win.cancelAnimationFrame(this.mdRefreshFrame);this.mdRefreshFrame=null;}if(this.mdRefreshPending)return;this.mdRefreshPending=true;queueMicrotask(()=>{this.mdRefreshPending=false;this.mdRefresh();});}
 mdRefresh(){
  if(!this.mdViews)return;
  const active=new Set();
  for(const leaf of this.mdLeaves()){
   const v=this.mdReadingLeaf(leaf);if(!v)continue;
   active.add(leaf);
   const old=this.mdViews.get(leaf);
   if(old&&(old.path!==v.path||old.body!==v.body)){old.observer?.disconnect();this.mdClearCommentAction(old);this.mdCloseAllCards(old);old.bar?.remove();old.root.classList.remove('noctilucent-md-floating-host');this.flushSave();this.mdViews.delete(leaf);}
   if(!this.mdViews.has(leaf))this.mdViews.set(leaf,{...v,toolbarState:old?.path===v.path?old.toolbarState:undefined});
   const state=this.mdViews.get(leaf);
   if(!state.bar?.isConnected)this.mdToolbar(state);
   if(!state.observer){const Observer=state.body.ownerDocument.defaultView.MutationObserver;
    if(Observer){state.observer=new Observer(records=>{if(records.every(x=>x.target?.closest?.('.noctilucent-md-bar,.noctilucent-md-card')))return;this.mdScheduleRefresh(true);});
    state.observer.observe(state.kind==='pptx'?state.reading:state.body,{childList:true,characterData:true,subtree:true});}}
  }
  for(const [leaf,state] of this.mdViews)if(!active.has(leaf)){state.observer?.disconnect();this.mdClearCommentAction(state);this.mdCloseAllCards(state);state.bar?.remove();state.root.classList.remove('noctilucent-md-floating-host');this.flushSave();this.mdViews.delete(leaf);}
  if(!active.size){this.mdMode=false;this.mdSelection=null;}
  if(this.eraserTarget?.kind==='reader'&&![...this.mdViews.values()].some(v=>v.path===this.eraserTarget.path))this.eraserTarget=null;
  this.refreshEraserUI();this.mdDecorate();
 }
 mdDecorate(){
  this.epubAdapter?.refresh();
  if(!this.mdViews)return;
  const perDocument=new Map();
  for(const v of this.mdViews.values()){
   if(v.commentAction&&!this.db.items.some(a=>a.id===v.commentAction.dataset.annotationId))this.mdClearCommentAction(v);
   const officeRanges=new Map();
   let lookup=null;
   for(const a of this.db.items){if(!['markdown-highlight','office-highlight'].includes(a.type)||a.path!==v.path)continue;
    if(!lookup)lookup=this.mdLookup(v);
    const r=this.mdFindRange(v,a,lookup);if(!r)continue;
    officeRanges.set(a.id,{annotation:a,range:r});
    let byColor=perDocument.get(r.startContainer.ownerDocument);
    if(!byColor){byColor=COLORS.map(()=>[]);perDocument.set(r.startContainer.ownerDocument,byColor);}
    const idx=Math.max(0,COLORS.indexOf(a.color));byColor[idx].push(r);
   }
   this.mdSyncOfficeMarkers(v,officeRanges);
   for(const [id,card] of v.cards||[]){if(!this.db.items.some(a=>a.id===id&&a.path===v.path)){this.mdRemoveCard(v,id);}}
  }
  const docs=new Set([...perDocument.keys(),...this.mdHighlightDocs]);
  for(const d of docs){const registry=d.defaultView?.CSS?.highlights,HighlightCtor=d.defaultView?.Highlight;
   if(!registry||!HighlightCtor)continue;
   const byColor=perDocument.get(d)||COLORS.map(()=>[]);
   COLORS.forEach((_,i)=>{const name='noctilucent-md-'+i;
    if(byColor[i].length){if(!sameHighlightRanges(registry.get?.(name),byColor[i]))registry.set(name,new HighlightCtor(...byColor[i]));}else registry.delete(name);
   });
  }
  this.mdHighlightDocs=new Set(perDocument.keys());
 }
 toolbarState(v,kind){return v.toolbarState??={layout:this.toolbarDisplayMode(kind),color:this.db.color,pos:kind==='pdf'?this.db.pos:this.db.mdToolbarPos,continuous:false};}
 toolbarDisplayMode(kind){const key=kind==='pdf'?'pdfToolbarDisplay':'readerToolbarDisplay';return ['vertical','horizontal','compact'].includes(this.db[key])?this.db[key]:'vertical';}
 applyToolbarDisplay(el,kind,v){if(!el)return;const mode=v?this.toolbarState(v,kind).layout:this.toolbarDisplayMode(kind);el.classList.toggle('noctilucent-layout-horizontal',mode==='horizontal');el.classList.toggle('noctilucent-layout-compact',mode==='compact');const control=el.querySelector('.noctilucent-layout-toggle');if(control){const next=mode==='vertical'?'horizontal':mode==='horizontal'?'compact':'vertical';const labels={horizontal:T('切換為橫向工具列'),compact:T('縮小工具列為單一圖示'),vertical:T('恢復直向工具列')};control.title=labels[next];control.setAttribute('aria-label',labels[next]);control.setAttribute('aria-expanded',String(mode!=='compact'));setIcon(control,mode==='vertical'?'rows-3':mode==='horizontal'?'minimize-2':'expand');}}
 cycleToolbarDisplay(kind,v){const st=this.toolbarState(v,kind),current=st.layout;st.layout=current==='vertical'?'horizontal':current==='horizontal'?'compact':'vertical';this.db[kind==='pdf'?'pdfToolbarDisplay':'readerToolbarDisplay']=st.layout;const bar=kind==='pdf'?v.toolbar:v.bar;this.applyToolbarDisplay(bar,kind,v);if(kind==='pdf'){if(v.toolbarGeometry)v.toolbarGeometry.dirty=true;this.ensureToolbar(v);}else if(bar){const maxX=Math.max(0,v.root.clientWidth-bar.offsetWidth),maxY=Math.max(0,v.root.clientHeight-bar.offsetHeight);if(bar.style.left)bar.style.left=Math.max(0,Math.min(parseFloat(bar.style.left)||0,maxX))+'px';if(bar.style.top)bar.style.top=Math.max(0,Math.min(parseFloat(bar.style.top)||0,maxY))+'px';}this.save();}

 mdToolbar(v){
  // Floating Markdown toolbar lives outside the rendered document: no layout shift,
  // no text-node mutation, and no toolbar in source/live-preview editor mode.
  const d=v.root.ownerDocument,bar=d.createElement('div');bar.className='noctilucent-md-bar';
  v.root.classList.add('noctilucent-md-floating-host');
  const pos=this.toolbarState(v,'reader').pos;
  if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){
   bar.style.left=Math.max(0,Math.min(pos.x,v.root.clientWidth-64))+'px';
   bar.style.top=Math.max(0,Math.min(pos.y,v.root.clientHeight-80))+'px';
  }else{bar.style.top='60px';bar.style.right='12px';}
  const button=(label,title,fn,parent=bar)=>{const b=d.createElement('button');b.type='button';b.title=title;b.textContent=label;b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=fn;parent.append(b);return b;};
  const grip=button('⠿',T('拖曳文字閱讀工具列'),()=>{});
  grip.className='noctilucent-md-grip';grip.setAttribute('aria-label',T('拖曳文字閱讀工具列'));
  this.drag(grip,bar,v.root,()=>{this.toolbarState(v,'reader').pos=this.db.mdToolbarPos={x:bar.offsetLeft,y:bar.offsetTop};this.save();});
  const layoutToggle=button('',T('切換為橫向工具列'),()=>this.cycleToolbarDisplay('reader',v));layoutToggle.className='noctilucent-layout-toggle';layoutToggle.setAttribute('aria-label',T('切換工具列顯示方式'));
  const group=d.createElement('div');group.className='noctilucent-highlight-group';bar.append(group);
  const modeBtn=button(T('連續：關'),T('連續高亮：選取閱讀模式中的文字便自動高亮，Esc 關閉'),()=>{const st=this.toolbarState(v,'reader');if(!st.continuous&&this.eraserTarget)this.eraserTarget=null;st.continuous=!st.continuous;this.mdRefreshMode();this.refreshEraserUI();},group);
  modeBtn.className='noctilucent-md-mode';v.mdModeBtn=modeBtn;
  button('▰',T('高亮目前選取的文字'),()=>{if(this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();}this.mdAdd(false,v);},group);
  const eraser=button('⌫',T('橡皮擦：點擊高亮擦除（有批註須確認，Esc 退出）'),()=>this.toggleEraser('reader',v.path));setIcon(eraser,'eraser');eraser.classList.add('noctilucent-eraser');v.eraserBtn=eraser;eraser.setAttribute('aria-pressed',String(this.eraserTarget?.kind==='reader'&&this.eraserTarget.path===v.path));
  const palette=d.createElement('div');palette.className='noctilucent-toolbar-palette';bar.append(palette);
  for(let i=0;i<COLORS.length;i++){const b=button('●',T('使用色票 ')+(i+1),()=>{this.toolbarState(v,'reader').color=this.db.color=i;this.save();this.mdRefreshPalette();},palette);b.style.color=COLORS[i];b.dataset.mdColor=String(i);}
  button('↶',T('撤回此文件的標記'),()=>{if(!this.undoHighlight(v.path))new Notice(T('本次工作階段沒有可撤回的標記'));});
  button('↷',T('重做此文件的標記'),()=>{if(!this.redoHighlight(v.path))new Notice(T('沒有可重做的標記'));});
  button('☰',T('開啟或收起此文件的批註側邊欄'),()=>this.toggleSidebar(v.path));
  v.root.append(bar);v.bar=bar;
  this.applyToolbarDisplay(bar,'reader',v);
  this.mdRefreshMode();this.mdRefreshPalette();
 }
 // Eraser removes the complete annotation record (highlight and its note).
 // One click is one undoable action. Never edit PDF, Office or Markdown bytes.
 toggleEraser(kind,path){
  if(this.eraserTarget?.kind===kind&&this.eraserTarget?.path===path){this.eraserTarget=null;}
  else{
   this.eraserTarget={kind,path};this.mdMode=false;this.mode=false;
   this.cancelArea();this.cancelSticky();this.snap=null;this.mdSelection=null;
  }
  for(const v of this.views.values())if(v.path===path&&kind==='pdf'){this.toolbarState(v,'pdf').continuous=false;if(v.modeBtn)v.modeBtn.textContent=T('連續：關');}for(const v of this.mdViews.values())if(v.path===path&&kind==='reader')this.toolbarState(v,'reader').continuous=false;
  this.mdRefreshMode();this.refreshEraserUI();
 }
 syncPdfEraserCursor(v){
  const active=this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path;
  for(const source of v.sources||[]){
   const d=source.ownerDocument;if(d===v.root.ownerDocument)continue;
   let style=d.getElementById('noctilucent-pdf-eraser-cursor');
   if(!active){style?.remove();continue;}
   if(!style){style=d.createElement('style');style.id='noctilucent-pdf-eraser-cursor';
    style.textContent='.page,.page *{cursor:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2232%22%20height%3D%2232%22%20viewBox%3D%220%200%2032%2032%22%3E%3Cg%20transform%3D%22rotate%28-42%2015%2015%29%22%3E%3Crect%20x%3D%228%22%20y%3D%224%22%20width%3D%2216%22%20height%3D%2224%22%20rx%3D%223%22%20fill%3D%22%23f7f3ff%22%20stroke%3D%22%23211f28%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M8%2018h16%22%20stroke%3D%22%23211f28%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M9%2018h14v7a2%202%200%200%201-2%202H11a2%202%200%200%201-2-2z%22%20fill%3D%22%23b5a0de%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E") 9 26,auto!important;user-select:none!important}';
    (d.head||d.documentElement).append(style);
   }
  }
 }
 refreshEraserUI(){
  for(const v of this.views.values()){const enabled=this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path;v.eraserBtn?.setAttribute('aria-pressed',String(!!enabled));v.root.classList.toggle('noctilucent-eraser-active',!!enabled);this.syncPdfEraserCursor(v);for(const source of v.sources||[]){const body=source.ownerDocument.body;if(body&&body!==v.root.ownerDocument.body)body.classList.toggle('noctilucent-eraser-pdf-document',!!enabled);}}
  for(const v of this.mdViews?.values()||[]){const enabled=this.eraserTarget?.kind==='reader'&&this.eraserTarget.path===v.path;v.eraserBtn?.setAttribute('aria-pressed',String(!!enabled));v.root.classList.toggle('noctilucent-eraser-active',!!enabled);}
 }
 eraseAnnotation(a){
  if(!a)return false; // Eraser supports PDF text highlights, free notes and area highlights.
  if(a.note&&!window.confirm(T('此標記含有文字批註，擦除後批註也會移除。要繼續嗎？')))return false;
  const index=this.db.items.indexOf(a);if(index<0)return false;
  this.invalidateRedo(a.path);
  this.undoHistory.push({kind:'erase',id:a.id,path:a.path,item:clone(a),index});
  this.db.items.splice(index,1);
  this.closeDocumentAnnotationCards(a.path,new Set([a.id]));
  this.save();this.scan();this.mdRefresh();this.refreshSidebars();
  return true;
 }
 eraseHit(d,x,y){
  const eraser=this.eraserTarget;if(!eraser)return null;
  const t=d.elementFromPoint?.(x,y);if(!t)return null;
  if(t.closest?.('.noctilucent-toolbar,.noctilucent-md-bar,.noctilucent-card,.noctilucent-md-card,.noctilucent-sidebar,.modal,.menu,input,textarea,button:not(.noctilucent-marker),[contenteditable]'))return null;
  if(eraser.kind==='pdf'){
   const page=t.closest?.('.page[data-page-number]');if(!page)return null;
   const v=this.findView(page);if(!v||v.path!==eraser.path)return null;
   // A clicked annotation marker always wins, including free-position and area markers.
   const targetId=t.closest?.('.noctilucent-marker')?.dataset.annotationId;
   const direct=targetId&&this.db.items.find(a=>a.id===targetId&&a.path===v.path&&a.page===Number(page.dataset.pageNumber));if(direct)return direct;
   const rect=this.pageLayer(v,page).getBoundingClientRect();if(!rect.width||!rect.height)return null;
   const px=(x-rect.left)/rect.width,py=(y-rect.top)/rect.height;
   const items=this.db.items.filter(a=>a.path===v.path&&a.page===Number(page.dataset.pageNumber));
   // Prefer text highlights in overlapping regions, and erase only one record per hit.
   const text=items.filter(a=>!special(a)&&a.rotation===this.rotation(page)&&(a.rects||[]).some(r=>px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h)).at(-1);
   if(text)return text;
   // Area shapes are not pointer-interactive overlays. Hit-test their rotated rectangle instead.
   return items.filter(a=>area(a)).reverse().find(a=>{const r=this.areaRect(a,page);return px>=r.x&&px<=r.x+r.w&&py>=r.y&&py<=r.y+r.h;})||null;
  }
  if(eraser.kind==='reader'){
   const leaf=this.mdLeaves().find(l=>l.view?.containerEl?.contains(t));const v=leaf&&this.mdViews?.get(leaf);
   if(!v||v.path!==eraser.path||!this.mdReadingLeaf(leaf))return null;
   const marker=t.closest?.('.noctilucent-office-persistent-marker');
   if(marker)return this.db.items.find(a=>a.id===marker.dataset.annotationId&&a.path===v.path)||null;
   if(!v.body.contains(t))return null;
   // Reuse the ranges already calculated for visible highlight markers.
   // Re-running full smart re-anchoring on every pointermove would cause lag.
   for(const [id,entry] of v.officeMarkers||[]){
    const range=entry.range;if(!range)continue;
    if([...range.getClientRects()].some(q=>x>=q.left&&x<=q.right&&y>=q.top&&y<=q.bottom))
     return this.db.items.find(a=>a.id===id&&a.path===v.path)||null;
   }
  }
  return null;
 }
 erasePointerDown(e){
  if(!this.eraserTarget||e.button!==0||e.isPrimary===false||this.eraserGesture)return;
  const d=e.target?.ownerDocument;if(!d)return;
  const t=e.target?.nodeType===1?e.target:e.target?.parentElement;
  if(!t||t.closest?.('.noctilucent-toolbar,.noctilucent-md-bar,.noctilucent-card,.noctilucent-md-card,.noctilucent-sidebar,.modal,.menu,input,textarea,button:not(.noctilucent-marker),[contenteditable]'))return;
  const kind=this.eraserTarget.kind;
  if(kind==='pdf'&&!t.closest('.page[data-page-number]'))return;
  if(kind==='reader'){
   const leaf=this.mdLeaves().find(l=>l.view?.containerEl?.contains(t));
   if(!leaf||this.mdViews?.get(leaf)?.path!==this.eraserTarget.path||!this.mdReadingLeaf(leaf))return;
   const v=this.mdViews.get(leaf);if(!v.body.contains(t)&&!t.closest('.noctilucent-office-persistent-marker'))return;
  }
  e.preventDefault();e.stopImmediatePropagation();d.getSelection?.()?.removeAllRanges?.();
  const gesture={pointerId:e.pointerId,doc:d,target:this.eraserTarget,ids:new Set(),x:e.clientX,y:e.clientY};this.eraserGesture=gesture;try{t.setPointerCapture?.(e.pointerId);}catch{}
  const collect=(x,y)=>{if(gesture.ids.size>=20)return;const a=this.eraseHit(d,x,y);if(a)gesture.ids.add(a.id);};
  collect(e.clientX,e.clientY);
  const move=m=>{if(m.pointerId!==gesture.pointerId)return;m.preventDefault();m.stopImmediatePropagation();const dx=m.clientX-gesture.x,dy=m.clientY-gesture.y;const distance=Math.hypot(dx,dy);const steps=Math.min(20,Math.max(1,Math.ceil(distance/8)));
   for(let i=1;i<=steps;i++)collect(gesture.x+dx*i/steps,gesture.y+dy*i/steps);
   gesture.x=m.clientX;gesture.y=m.clientY;
  };
  const finish=m=>{if(m.pointerId!==gesture.pointerId)return;if(m.type==='pointerup')collect(m.clientX,m.clientY);cleanup();if(m.type!=='pointerup'||this.eraserTarget!==gesture.target)return;
   const ids=[...gesture.ids];if(!ids.length){new Notice(T('橡皮擦：請點擊或拖過已高亮的文字'));return;}
   for(const id of ids){const a=this.db.items.find(x=>x.id===id);if(a)this.eraseAnnotation(a);}
  };
  const cleanup=()=>{d.removeEventListener('pointermove',move,true);d.removeEventListener('pointerup',finish,true);d.removeEventListener('pointercancel',finish,true);try{if(t.hasPointerCapture?.(gesture.pointerId))t.releasePointerCapture(gesture.pointerId);}catch{}if(this.eraserGesture===gesture)this.eraserGesture=null;};gesture.cleanup=cleanup;
  d.addEventListener('pointermove',move,true);d.addEventListener('pointerup',finish,true);d.addEventListener('pointercancel',finish,true);
 }
 eraseClick(e){
  // Keyboard-generated clicks and marker buttons still work as single erases.
  if(!this.eraserTarget||e.button!==0||this.eraserGesture)return;
  const t=e.target?.nodeType===1?e.target:e.target?.parentElement;if(!t)return;
  if(!t.closest('.noctilucent-marker'))return;
  const a=this.eraseHit(t.ownerDocument,e.clientX,e.clientY);if(!a)return;
  e.preventDefault();e.stopImmediatePropagation();this.eraseAnnotation(a);
 }

 mdHandleUndoKey(e){
  if(e.defaultPrevented||e.isComposing||e.repeat||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey))return;
  const key=String(e.key).toLowerCase();if(key!=='z'&&key!=='y')return;
  const leaf=this.app.workspace.activeLeaf,v=this.mdReadingLeaf(leaf);
  if(!v||!this.mdViews?.has(leaf))return; // Never intercept PDF or Markdown edit mode.
  const t=e.target?.nodeType===1?e.target:e.target?.parentElement;
  if(!t)return;
  if(t.isContentEditable||t.closest?.('input,textarea,select,[contenteditable],[role="textbox"],.cm-editor,.noctilucent-sidebar'))return;
  // Avoid catching key commands in other plugins, popovers, or panels.
  if(!v.root.contains(t)&&t!==v.root.ownerDocument.body&&t!==v.root.ownerDocument.documentElement)return;
  const path=v.path,redo=key==='y';
  if(!(redo?this.redoHistory:this.undoHistory).some(h=>h.path===path))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(redo)this.redoHighlight(path);else this.undoHighlight(path);
 }
 mdRefreshMode(){for(const v of this.mdViews?.values()||[])if(v.mdModeBtn){v.mdModeBtn.textContent=T('連續：')+(this.toolbarState(v,'reader').continuous?T('開'):T('關'));v.mdModeBtn.setAttribute('aria-pressed',String(this.toolbarState(v,'reader').continuous));}}
 mdRefreshPalette(){this.epubAdapter?.ui();for(const v of this.mdViews?.values()||[])for(const b of v.bar?.querySelectorAll('[data-md-color]')||[])b.setAttribute('aria-pressed',String(Number(b.dataset.mdColor)===this.toolbarState(v,'reader').color));}
 mdAdd(comment,view){
  const snap=view?(this.mdSelection?.leaf===view.leaf?this.mdSelection:null):this.mdSelection;
  if(!snap||!this.mdReadingLeaf(snap.leaf)||this.mdReadingLeaf(snap.leaf).path!==snap.path){new Notice(T('請在文字閱讀畫面中選取同一段落內的文字'));return;}
  const v=this.mdViews.get(snap.leaf),r=v&&this.mdFindRange(v,{mdAnchor:snap.anchor});
  if(!r){new Notice(T('原文已重新排版，請再次選取文字'));return;}
  let a=this.db.items.find(x=>['markdown-highlight','office-highlight'].includes(x.type)&&x.path===snap.path&&!!x.mdAnchor?.code===!!snap.anchor.code&&x.mdAnchor?.block===snap.anchor.block&&x.mdAnchor?.start===snap.anchor.start&&x.mdAnchor?.quote===snap.quote);
  if(!a){const now=Date.now();a={id:globalThis.crypto.randomUUID(),type:['office','pptx'].includes(v.kind)?'office-highlight':'markdown-highlight',path:snap.path,page:0,mdAnchor:snap.anchor,text:snap.quote,color:COLORS[this.toolbarState(v,'reader').color]||COLORS[0],note:'',created:now,modified:now};
   this.db.items.push(a);this.invalidateRedo(a.path);this.undoHistory.push({kind:'create',id:a.id,path:a.path});this.save();}
  v.selection=null;this.mdSelection=null;this.mdRefresh();this.refreshSidebars();
  if(comment)this.mdCard(v,a,r); // Persistent Office markers are managed by mdDecorate() for every annotation.
 }
 mdClearCommentAction(v){
  if(!v)return;
  // Clean up any legacy single-use button as well as every persistent marker.
  v.commentAction?.remove();v.commentAction=null;
  if(v.commentActionScroll){v.reading?.removeEventListener('scroll',v.commentActionScroll,true);v.commentActionScroll=null;}
  if(v.officeMarkerScroll){v.reading?.removeEventListener('scroll',v.officeMarkerScroll,true);v.officeMarkerScroll=null;}if(v.officeMarkerFrame!=null){v.reading.ownerDocument.defaultView.cancelAnimationFrame(v.officeMarkerFrame);v.officeMarkerFrame=null;}
  this.mdHideMarkerPreview(v);
  for(const entry of v.officeMarkers?.values()||[])entry.button.remove();
  v.officeMarkers?.clear();
 }
 mdPositionOfficeMarker(v,entry){
  const {button,range}=entry;
  if(!button.isConnected||!range){button.style.display='none';return;}
  // The last glyph's rectangle matches the small PDF marker at the end of a highlight.
  const last=lastVisibleRect(range);
  if(!last){button.style.display='none';return;}
  const host=v.root.getBoundingClientRect(),reading=v.reading.getBoundingClientRect();
  if(last.bottom<=Math.max(host.top,reading.top)||last.top>=Math.min(host.bottom,reading.bottom)||
     last.right<=Math.max(host.left,reading.left)||last.left>=Math.min(host.right,reading.right)){
   button.style.display='none';return;
  }
  button.style.display='';
  // PDF uses translate(-90%,-85%) on a 12x12 marker. Reuse its styling and anchor.
  button.style.left=Math.max(6,Math.min(last.right-host.left,host.width-6))+'px';
  button.style.top=Math.max(6,Math.min(last.top-host.top,host.height-6))+'px';
 }
 mdPositionOfficeMarkers(v){
  if(!v?.officeMarkers?.size)return;
  const host=v.root.getBoundingClientRect(),reading=v.reading.getBoundingClientRect(),updates=[];
  for(const entry of v.officeMarkers.values()){
   const {button,range}=entry;
   if(!button.isConnected||!range){updates.push([button,null]);continue;}
   const last=lastVisibleRect(range);
   if(!last){updates.push([button,null]);continue;}
   if(last.bottom<=Math.max(host.top,reading.top)||last.top>=Math.min(host.bottom,reading.bottom)||
      last.right<=Math.max(host.left,reading.left)||last.left>=Math.min(host.right,reading.right)){
    updates.push([button,null]);continue;
   }
   updates.push([button,{left:Math.max(6,Math.min(last.right-host.left,host.width-6))+'px',top:Math.max(6,Math.min(last.top-host.top,host.height-6))+'px'}]);
  }
  for(const [button,pos] of updates){if(!pos){button.style.display='none';continue;}button.style.display='';button.style.left=pos.left;button.style.top=pos.top;}
 }
 mdSyncOfficeMarkers(v,matches){
  if(!v.officeMarkers)v.officeMarkers=new Map();
  for(const [id,entry] of v.officeMarkers){
   if(!matches.has(id)){this.mdHideMarkerPreview(v,id);entry.button.remove();v.officeMarkers.delete(id);}
  }
  const d=v.root.ownerDocument;
  for(const [id,{annotation:a,range}] of matches){
   let entry=v.officeMarkers.get(id);
   if(!entry){
    const button=d.createElement('button');
    button.type='button';button.className='noctilucent-marker noctilucent-office-persistent-marker';
    button.dataset.annotationId=id;
    button.addEventListener('pointerenter',()=>this.mdShowMarkerPreview(v,id,button));
    button.addEventListener('pointerleave',()=>this.mdHideMarkerPreview(v,id));
    button.addEventListener('focus',()=>this.mdShowMarkerPreview(v,id,button));
    button.addEventListener('blur',()=>this.mdHideMarkerPreview(v,id));
    button.addEventListener('pointerdown',e=>e.stopPropagation());
    button.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});
    button.addEventListener('mouseup',e=>e.stopPropagation());
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();this.mdHideMarkerPreview(v,id);
     if(this.eraserTarget?.kind==='reader'&&this.eraserTarget.path===v.path)return;
     const current=this.mdViews?.get(v.leaf);
     if(current!==v||!this.mdReadingLeaf(v.leaf)||this.mdReadingLeaf(v.leaf).path!==a.path)return;
     const record=this.db.items.find(x=>x.id===id);
     if(!record)return;
     const located=this.mdFindRange(v,record);
     if(located)this.mdCard(v,record,located);
     else new Notice(T('原文位置已變動，請重新選取'));
    });
    v.root.append(button);entry={button,range};v.officeMarkers.set(id,entry);
   }
   entry.range=range;
   entry.button.textContent=a.note?'▣':'+';
   entry.button.title=a.note?T('開啟批註'):T('新增批註／編輯批註');
   entry.button.setAttribute('aria-label',entry.button.title);
   entry.button.style.background=a.color;
  }
  this.mdPositionOfficeMarkers(v);
  // One capture listener per Office reader; no interval or per-marker observer.
  if(!v.officeMarkerScroll){
   v.officeMarkerScroll=()=>{if(v.officeMarkerFrame!=null)return;const win=v.reading.ownerDocument.defaultView;v.officeMarkerFrame=win.requestAnimationFrame(()=>{v.officeMarkerFrame=null;this.mdPositionOfficeMarkers(v);});};
   v.reading.addEventListener('scroll',v.officeMarkerScroll,true);
  }
 }
 mdRemoveCard(v,id){
  const c=v.cards?.get(id);if(!c)return;
  this.releaseEditors(c);c.remove();v.cards.delete(id);
  this.syncNoteUI();
 }
 mdCloseAllCards(v){
  for(const [id,c] of v.cards||[]){this.releaseEditors(c);c.remove();}
  v.cards?.clear();
  if(v.card){this.releaseEditors(v.card);v.card.remove();v.card=null;}
 }
 mdHideMarkerPreview(v,id=null){
  if(!v?.mdPreview)return;
  if(id!==null&&v.mdPreview.dataset.annotationId!==id)return;
  v.mdPreview.remove();v.mdPreview=null;
 }
 mdShowMarkerPreview(v,id,button){
  const a=this.db.items.find(x=>x.id===id&&x.path===v.path);
  if(!a?.note||!button.isConnected)return;
  this.mdHideMarkerPreview(v);
  const d=v.root.ownerDocument,tip=d.createElement('div');
  tip.className='noctilucent-md-hover-preview';tip.dataset.annotationId=id;
  tip.setAttribute('role','tooltip');tip.textContent=a.note;
  v.root.append(tip);v.mdPreview=tip;
  const rect=button.getBoundingClientRect(),host=v.root.getBoundingClientRect();
  const maxX=Math.max(8,host.width-270);
  tip.style.left=Math.max(8,Math.min(maxX,rect.left-host.left+16))+'px';
  tip.style.top=Math.max(8,Math.min(host.height-64,rect.top-host.top+19))+'px';
 }
 mdCard(v,a,range,focus=true,epubPoint=null){
  // Office and Markdown cards use the same save semantics as PDF cards:
  // autosave remains active, while the explicit Save button closes only after
  // flushSave() has confirmed that this revision was written successfully.
  if(!v.cards)v.cards=new Map();
  const existing=v.cards.get(a.id);if(existing){existing.style.zIndex=String(++this.mdCardStack);if(focus)existing.querySelector('textarea')?.focus();return;}
  const d=v.root.ownerDocument,c=d.createElement('div');c.className='noctilucent-md-card';c.dataset.annotationId=a.id;
  const closeCard=()=>{if(v.cards?.get(a.id)!==c)return;this.flushSave();this.mdRemoveCard(v,a.id);};
  const head=d.createElement('div');head.className='noctilucent-md-card-head';
  const name=d.createElement('strong');name.textContent=this.mdKind(v)+T(' 批註');head.append(name);
  const close=d.createElement('button');close.type='button';close.textContent='×';close.title=T('關閉');close.addEventListener('click',closeCard);head.append(close);c.append(head);
  // Office / Markdown floating annotation cards: drag by the heading (left or
  // right mouse button), like the PDF floating card. Right-drag suppresses
  // the browser context menu only on this handle, never inside the editor.
  // Pointer capture keeps the motion active when the pointer leaves the card.
  {
  head.setAttribute('aria-label',T('拖曳批註視窗（按住滑鼠左鍵或右鍵）'));
  head.addEventListener('contextmenu',e=>{if(e.target===close)return;e.preventDefault();e.stopPropagation();});
  head.addEventListener('pointerdown',e=>{
   if((e.button!==0&&e.button!==2)||e.target.closest('button'))return;
   if(v.cards?.get(a.id)!==c)return;
   e.preventDefault();e.stopPropagation();
   const startX=e.clientX,startY=e.clientY;
   const left=c.offsetLeft,top=c.offsetTop;
   const pointerId=e.pointerId;let moved=false,finished=false;
   head.setPointerCapture(pointerId);
   c.classList.add('noctilucent-md-card-dragging');
   const move=m=>{if(m.pointerId!==pointerId||finished)return;
    const dx=m.clientX-startX,dy=m.clientY-startY;
    if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
    const maxX=Math.max(0,v.reading.clientWidth-c.offsetWidth);
    const minY=v.reading.scrollTop,maxY=Math.max(minY,v.reading.scrollTop+v.reading.clientHeight-c.offsetHeight);
    c.style.right='auto';
    c.style.left=Math.max(0,Math.min(maxX,left+dx))+'px';
    c.style.top=Math.max(minY,Math.min(maxY,top+dy))+'px';
   };
   const finish=m=>{if(m.pointerId!==pointerId||finished)return;finished=true;
    head.removeEventListener('pointermove',move);
    head.removeEventListener('pointerup',finish);
    head.removeEventListener('pointercancel',finish);
    head.removeEventListener('lostpointercapture',lost);
    if(head.hasPointerCapture(pointerId))head.releasePointerCapture(pointerId);
    c.classList.remove('noctilucent-md-card-dragging');
    if(moved)c.dataset.dragged='yes';
   };
   const lost=m=>finish(m);
   head.addEventListener('pointermove',move);
   head.addEventListener('pointerup',finish);
   head.addEventListener('pointercancel',finish);
   head.addEventListener('lostpointercapture',lost);
  });
  }
  // PDF canonical card has no duplicated source quote; the sidebar still retains it.

  const palette=d.createElement('div');palette.className='noctilucent-card-colors noctilucent-md-card-colors';
  const paletteButtons=[];
  const updatePalette=()=>{for(const btn of paletteButtons)btn.setAttribute('aria-pressed',String(btn.dataset.highlightColor===a.color));};
  for(const color of COLORS){
   const btn=d.createElement('button');btn.type='button';btn.textContent='●';btn.style.color=color;btn.dataset.highlightColor=color;
   btn.title=T('更改高亮顏色');btn.setAttribute('aria-label',T('更改高亮顏色 ')+color);
   btn.addEventListener('mousedown',e=>e.preventDefault());
   btn.addEventListener('click',()=>{
    if(!this.db.items.some(x=>x.id===a.id))return;
    if(a.color===color)return;
    const beforeColor=a.color;this.invalidateRedo(a.path);
    this.undoHistory.push({kind:'md-color',id:a.id,path:a.path,beforeColor});
    a.color=color;a.modified=Date.now();
    this.save();this.mdDecorate();this.refreshSidebars();updatePalette();
   });
   palette.append(btn);paletteButtons.push(btn);
  }
  updatePalette();c.append(palette);
  if(a.type==='epub-region'&&this.epubAdapter){
   const row=d.createElement('div');row.className='noctilucent-area-controls noctilucent-epub-area-controls';
   const select=d.createElement('select');select.setAttribute('aria-label',T('區域樣式'));
   for(const [value,label] of [['fill',T('半透明填色')],['border',T('彩色外框')],['both',T('填色＋外框')]]){const option=d.createElement('option');option.value=value;option.textContent=label;select.append(option);}
   select.value=a.areaStyle||'both';select.onchange=()=>this.epubAdapter.changeRegion(a,{areaStyle:select.value});
   const alpha=d.createElement('input');alpha.type='range';alpha.min='5';alpha.max='60';alpha.step='5';alpha.value=String(Math.round((Number.isFinite(a.opacity)?a.opacity:.15)*100));alpha.setAttribute('aria-label',T('填色不透明度'));
   const pct=d.createElement('span');pct.textContent=alpha.value+'%';alpha.oninput=()=>{pct.textContent=alpha.value+'%';};alpha.onchange=()=>this.epubAdapter.changeRegion(a,{opacity:Number(alpha.value)/100});
   const copyImage=d.createElement('button');copyImage.type='button';copyImage.textContent=T('複製圖片');copyImage.onclick=()=>this.epubAdapter.copyRegionImage(a.id);
   const copyWithNote=d.createElement('button');copyWithNote.type='button';copyWithNote.textContent=T('複製圖片＋批註');copyWithNote.onclick=()=>this.epubAdapter.copyRegion(a.id);
   const adjust=d.createElement('button');adjust.type='button';adjust.textContent=T('調整區域');adjust.onclick=()=>{this.epubAdapter.beginRegionAdjust(a.id,v);this.mdRemoveCard(v,a.id);};
   row.append(select,alpha,pct,copyImage,copyWithNote,adjust);c.append(row);
  }
  const textarea=d.createElement('textarea');textarea.className='noctilucent-md-card-editor';textarea.value=a.note||'';
  textarea.placeholder=T('輸入批註（自動儲存）');c.append(textarea);
  const footer=d.createElement('div');footer.className='noctilucent-md-card-footer';c.append(footer);
  this.bindEditor(textarea,a,footer,()=>{if(v.cards?.get(a.id)===c)closeCard();});
  const actions=d.createElement('div');actions.className='noctilucent-md-card-actions';footer.append(actions);
  const copy=d.createElement('button');copy.type='button';copy.textContent=T('複製原文＋批註');
  copy.addEventListener('click',()=>navigator.clipboard.writeText((a.text||'')+'\n\n'+textarea.value).catch(()=>new Notice(T('複製失敗'))));actions.append(copy);
  const del=d.createElement('button');del.type='button';del.textContent=T('刪除標記');
  del.addEventListener('click',()=>{
   if(!window.confirm(T('刪除這個高亮與批註？')))return;
   this.db.items=this.db.items.filter(x=>x.id!==a.id);
   this.undoHistory=this.undoHistory.filter(h=>h.id!==a.id);
   this.invalidateRedo(a.path);this.save();closeCard();this.mdDecorate();this.refreshSidebars();
  });actions.append(del);
  v.reading.append(c);v.cards.set(a.id,c);c.style.zIndex=String(++this.mdCardStack);
  c.addEventListener('pointerdown',()=>{c.style.zIndex=String(++this.mdCardStack);},true);
  const rr=range?.getBoundingClientRect(),pr=v.reading.getBoundingClientRect();
  if(v.kind==='epub'&&epubPoint&&Number.isFinite(epubPoint.x)&&Number.isFinite(epubPoint.y)){
   const host=v.reading, win=d.defaultView, margin=8,gap=12;
   const sx=pr.width/(host.offsetWidth||pr.width||1)||1,sy=pr.height/(host.offsetHeight||pr.height||1)||1;
   const x=(epubPoint.x-pr.left)/sx-host.clientLeft+host.scrollLeft,y=(epubPoint.y-pr.top)/sy-host.clientTop+host.scrollTop;
   const l=host.scrollLeft+margin,t=host.scrollTop+margin,r=host.scrollLeft+host.clientWidth-margin,b=host.scrollTop+host.clientHeight-margin;
   const w=c.offsetWidth,h=c.offsetHeight;
   const clamp=(n,min,max)=>Math.max(min,Math.min(n,Math.max(min,max)));
   c.style.right='auto';c.style.left=clamp(x+gap+w<=r?x+gap:x-gap-w,l,r-w)+'px';
   c.style.top=clamp(y+gap+h<=b?y+gap:y-gap-h,t,b-h)+'px';
  }else if(rr&&pr&&rr.width){c.style.top=Math.max(42,rr.bottom-pr.top+v.reading.scrollTop+8)+'px';c.style.left=Math.max(8,Math.min(rr.left-pr.left,Math.max(8,pr.width-330)))+'px';}
  else{c.style.top='52px';c.style.right='12px';}
  if(focus){if(v.kind==='epub')textarea.focus({preventScroll:true});else textarea.focus();}
 }
 mdOnMouseUp(e){
  if(this.eraserTarget?.kind==='reader')return;
  if(e.target?.closest?.('.noctilucent-md-bar,.noctilucent-md-card,.noctilucent-sidebar,.noctilucent-office-persistent-marker,.noctilucent-md-hover-preview'))return;
  const d=e.target?.ownerDocument;if(!d)return;
  const snap=this.mdCapture(d);
  if(snap){this.mdSelection=snap;const v=this.mdViews.get(snap.leaf);if(v){v.selection=snap;if(this.toolbarState(v,'reader').continuous&&e.button===0)this.mdAdd(false,v);}return;}
  if(e.button!==0||d.getSelection()?.toString())return;
  const leaf=this.mdLeaves().find(l=>l.view.containerEl.contains(e.target));
  const v=this.mdViews?.get(leaf);if(!v||!this.mdReadingLeaf(leaf))return;
  const x=e.clientX,y=e.clientY;let lookup=null;
  for(const a of this.db.items){if(!['markdown-highlight','office-highlight'].includes(a.type)||a.path!==v.path)continue;
   if(!lookup)lookup=this.mdLookup(v);
   const r=this.mdFindRange(v,a,lookup);if(!r)continue;
   for(const rect of r.getClientRects())if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom){this.mdCard(v,a,r);return;}
  }
 }
 async mdJump(a){
  const file=this.app.vault.getAbstractFileByPath(a.path);if(!file){new Notice(T('找不到原始文件'));return;}
  let leaf=this.mdLeaves().find(l=>this.mdReadingLeaf(l)?.path===a.path);
  if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);if(file.extension==='md'&&leaf.view.getMode?.()!=='preview')await leaf.view.setMode?.('preview');}
  await this.app.workspace.revealLeaf(leaf);
  this.mdRefresh();let v=this.mdViews.get(leaf),r=v&&this.mdFindRange(v,a);
  if(v?.kind==='pptx'&&!r){
   const anchor=a.mdAnchor||{},controls=this.mdPptControls(v);
   if(!controls?.input||!controls?.jump){new Notice(T('Office Viewer 的投影片跳轉控制項不可用'));return;}
   const count=this.mdPptSlideCount(v),number=Number(anchor.slideNumber),key=anchor.slideKey;
   if(Number.isSafeInteger(number)&&number>=1){await this.mdPptNavigate(v,number,key||null);}
   else if(key&&count&&count<=60){
    // Legacy notes have slideKey but no slide number. Search only after an
    // explicit user jump, and stop once the original fingerprint is located.
    const current=this.mdPptSlideNumber(v),sequence=Array.from({length:count},(_,i)=>i+1);
    sequence.sort((x,y)=>Math.abs(x-(current||1))-Math.abs(y-(current||1)));
    for(const target of sequence){
     if(!this.app.workspace||!this.db.items.includes(a))return;
     {const live=this.mdReadingLeaf(v.leaf);if(this.mdPptSlideNumber(live)===target&&this.mdSlideKey(live)===key)break;}
     const located=await this.mdPptNavigate(v,target,key);
     if(located)break;
    }
   }else if(key&&count>60)new Notice(T('舊批註缺少投影片編號；簡報超過 60 頁，為避免大量換頁，請先手動接近該頁再跳轉。'));
   this.mdRefresh();v=this.mdViews.get(leaf);r=v&&this.mdFindRange(v,a);
  }
  if(!r){new Notice(T('找不到可安全定位的原文（可能尚未到達對應投影片），未自動開啟批註'));return;}
  const el=r.startContainer.parentElement;el?.scrollIntoView({behavior:'smooth',block:'center'});
  // Sidebar arrows are navigation only; never open editing cards.
  if(el?.animate)el.animate([{outline:'2px solid var(--interactive-accent)',outlineOffset:'2px'},{outline:'2px solid transparent',outlineOffset:'2px'}],{duration:1000});
 }

 async onload(){this.db=await this.loadData()||{items:[],color:0,pos:null};this.languageMode=['auto','en','zh-TW'].includes(this.db.uiLanguage)?this.db.uiLanguage:'auto';noctilucentLocale=resolveNoctilucentLocale(this.languageMode,detectObsidianLocale()); if(!Array.isArray(this.db.items))throw Error('Invalid annotation data'); this.views=new Map();this.mdViews=new Map();this.epubAdapter=new NoctilucentEpubAdapter(this);this.mdCardStack=150;this.mdMode=false;this.eraserTarget=null;this.mdHighlightDocs=new Set();this.mdSelection=null;this.recoveryAlive=true;this.recoveryResults=new Map();this.recoveryHashes=new Map();this.recoveryBusy=0;this.recoveryDiagnosticHistory=[];this.docs=new Map();this.undoKeys=new Map();this.undoHistory=[];this.redoHistory=[];this.mode=false;this.stickyView=null;this.areaView=null;this.areaGesture=null;this.stickyListeners=new Map();this.pref={...DEFAULT_SAVE,...this.db.savePreferences};if(![300,500,1000,2000,3000].includes(this.pref.delay))this.pref.delay=500;this.rev=0;this.savedRev=0;this.renderRev=0;this.sideRev=0;this.writing=null;this.saveError=false;this.editors=new Map();this.focusedEditor=null;this.pendingNoteUI=new Set();this.settingsTab=new PerformanceSettings(this.app,this);this.addSettingTab(this.settingsTab);this.lastEditAt=0;this.firstEditAt=0;this.pending=Promise.resolve();this.registerView(SIDEBAR,leaf=>new AnnotationSidebar(leaf,this));this.registerMarkdownPostProcessor(()=>{this.mdScheduleRefresh(true);});this.registerMarkdownPostProcessor(el=>{for(const seg of el.querySelectorAll('.noctilucent-export-spectrum > .noctilucent-export-segment')){const n=Number((seg.textContent||'').trim().match(/^\d+/)?.[0]);if(Number.isSafeInteger(n)&&n>0)seg.style.flexGrow=String(n);}});this.registerDomEvent(document,'mouseup',e=>this.mdOnMouseUp(e));this.registerDomEvent(document,'click',e=>this.eraseClick(e),true);this.registerDomEvent(document,'pointerdown',e=>this.erasePointerDown(e),true);this.registerDomEvent(document,'keydown',e=>{if(e.key==='Escape')this.epubAdapter?.setMode('');if(e.key==='Escape'&&this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();}this.mdHandleUndoKey(e);},true);this.registerDomEvent(window,'resize',()=>{for(const v of this.mdViews.values())if(v.officeMarkers)this.mdPositionOfficeMarkers(v);});this.registerDomEvent(document,'click',e=>{if(e.target?.closest?.('.pptx-viewer__controls,.pptx-viewer__thumbnail-rail,.pptx-viewer__page-jump'))this.mdScheduleRefresh();});this.registerDomEvent(document,'keydown',e=>{if(e.key!=='Escape')return;const v=this.mdViews.get(this.app.workspace.activeLeaf);if(v){this.toolbarState(v,'reader').continuous=false;this.mdRefreshMode();}});this.registerEvent(this.app.workspace.on('layout-change',()=>this.mdRefresh()));this.registerEvent(this.app.workspace.on('file-open',()=>queueMicrotask(()=>{this.sidebarPath();this.mdRefresh();this.refreshSidebars();})));this.registerEvent(this.app.vault.on('modify',f=>{if(f?.extension==='md'&&this.mdViews?.size)this.mdScheduleRefresh();}));this.addCommand({id:'markdown-highlight-selection',name:'Highlight Markdown Reading View selection',callback:()=>this.mdAdd(false)});this.addCommand({id:'markdown-comment-selection',name:'Highlight and comment in Markdown Reading View',callback:()=>this.mdAdd(true)});this.addCommand({id:'open-annotations',name:'Open PDF annotations',callback:()=>this.openSidebar()});this.addRibbonIcon('stars',T('Noctilucent 批註'),()=>this.openSidebar());this.registerEvent(this.app.workspace.on('active-leaf-change',leaf=>{this.sidebarPath(leaf);if(leaf?.view?.getViewType?.()==='pdf'&&leaf.view.file?.path)this.lastPdfPath=leaf.view.file.path;if(this.stickyView&&leaf?.view?.getViewType?.()==='pdf'&&leaf.view.containerEl!==this.stickyView.root)this.cancelSticky();if(this.areaView&&leaf?.view?.containerEl!==this.areaView.root)this.cancelArea();if(this.eraserTarget&&leaf?.view?.file?.path!==this.eraserTarget.path){this.eraserTarget=null;this.refreshEraserUI();}this.flushSave();this.refreshSidebars();this.mdRefresh();for(const v of this.views.values())if(v.overlay)this.syncOverlay(v);}));this.addCommand({id:'reset-toolbar',name:'Reset floating toolbar',callback:()=>{this.db.pos=null;this.db.mdToolbarPos=null;for(const v of [...this.views.values(),...this.mdViews.values(),...this.epubAdapter.views.values()])if(v.toolbarState)v.toolbarState.pos=null;for(const v of this.epubAdapter?.views.values()||[]){v.bar?.remove();this.epubAdapter.toolbar(v);}for(const v of this.views.values()){v.toolbar?.remove();this.toolbar(v);this.ensureToolbar(v);}for(const v of this.mdViews.values()){v.bar?.remove();this.mdToolbar(v);}this.save();this.scan();new Notice(T('Noctilucent：工具列位置已重設'));}});this.addCommand({id:'undo-highlight',name:'Undo PDF highlight',callback:()=>this.runHistoryCommand(false)});this.addCommand({id:'redo-highlight',name:'Redo PDF highlight',callback:()=>this.runHistoryCommand(true)});this.addCommand({id:'sticky-note',name:'Place free-position annotation',callback:()=>{const leaf=this.app.workspace.activeLeaf;const v=this.views.get(leaf?.view?.containerEl);if(v)this.toggleSticky(v);else new Notice(T('請先開啟 PDF'));}});this.addCommand({id:'area-highlight',name:'Draw area highlight',callback:()=>{const v=this.views.get(this.app.workspace.activeLeaf?.view?.containerEl);if(v)this.toggleArea(v);else new Notice(T('請先開啟 PDF'));}});this.addCommand({id:'highlight-selection',name:'Highlight PDF selection',callback:()=>this.add(false)});this.addCommand({id:'comment-selection',name:'Highlight and comment',callback:()=>this.add(true)});this.addCommand({id:'symbol-preview-diagnostic',name:'Symbol recovery preview diagnostics',callback:()=>{console.info('Noctilucent symbol recovery preview',this.lastRecoveryDiagnostic||{status:'no new anomalous highlight'});new Notice(this.lastRecoveryDiagnostic?T('已將最近一次符號辨識摘要輸出至開發者工具 Console'):T('請先新增含異常符號的高亮'));}});this.addCommand({id:'copy-symbol-preview-diagnostics',name:'Copy symbol recovery diagnostics',callback:async()=>{try{await navigator.clipboard.writeText(JSON.stringify(this.recoveryDiagnosticHistory,null,2));new Notice(T('已複製本次工作階段的符號診斷紀錄'));}catch{new Notice(T('剪貼簿寫入失敗，請使用 Console 診斷指令。'));}}});this.registerInterval(window.setInterval(()=>{if(!this.isEditingNote()){this.syncNoteUI();this.scan();}},350));this.registerEvent(this.app.vault.on('rename',(f,old)=>{if(this.lastSidebarDocumentPath===old||this.lastSidebarDocumentPath?.startsWith(old+'/'))this.lastSidebarDocumentPath=f.path+this.lastSidebarDocumentPath.slice(old.length);if(this.db.documentViewPrefs){const next={...this.db.documentViewPrefs};for(const [key,value] of Object.entries(this.db.documentViewPrefs))if(key===old||key.startsWith(old+'/')){delete next[key];Object.defineProperty(next,f.path+key.slice(old.length),{value,writable:true,configurable:true,enumerable:true});}this.db.documentViewPrefs=next;}for(const a of this.db.items)if(a.path===old||a.path.startsWith(old+'/'))a.path=f.path+a.path.slice(old.length);for(const h of [...this.undoHistory,...this.redoHistory])if(h.path===old||h.path.startsWith(old+'/')){h.path=f.path+h.path.slice(old.length);if(h.item)h.item.path=h.path;}if(this.lastPdfPath===old||this.lastPdfPath?.startsWith(old+'/'))this.lastPdfPath=f.path+this.lastPdfPath.slice(old.length);for(const l of this.app.workspace.getLeavesOfType(SIDEBAR)){const v=l.view;if(v.path===old||v.path?.startsWith(old+'/'))v.path=f.path+v.path.slice(old.length);}this.save();this.scan();}));this.scan();this.mdRefresh();}
 async changeUILanguage(mode){
  if(!['auto','en','zh-TW'].includes(mode))return;
  if(mode===this.languageMode)return;
  const from=noctilucentLocale;this.languageMode=mode;this.db.uiLanguage=mode;
  const to=resolveNoctilucentLocale(mode,detectObsidianLocale());
  noctilucentLocale=to;await this.save();
  for(const v of this.epubAdapter?.views.values()||[]){for(const card of v.cards.values())relocalizeCard(card,from,to);v.bar?.remove();this.epubAdapter.toolbar(v);}
  // Preserve open card editors and their contents while translating only chrome.
  for(const v of this.views.values()){
   for(const card of v.cards?.values()||[])relocalizeCard(card,from,to);
   if(v.toolbar){v.toolbar.remove();v.toolbar=null;this.toolbar(v);this.ensureToolbar(v);}
  }
  for(const v of this.mdViews.values()){
   for(const card of v.cards?.values()||[])relocalizeCard(card,from,to);
   if(v.bar){v.bar.remove();v.bar=null;this.mdToolbar(v);}
  }
  for(const leaf of this.app.workspace.getLeavesOfType(SIDEBAR)){
   const side=leaf.view;if(!(side instanceof AnnotationSidebar))continue;
   const selected=side.query;await side.onClose();await side.onOpen();
   side.query=selected;const input=side.root?.querySelector('input[type=search]');if(input)input.value=selected;
   side.refresh(true);
  }
  this.updateSaveUI();
  this.settingsTab?.display();
 }
 changePreference(key,value){this.pref[key]=value;this.db.savePreferences={...this.pref};this.save();this.updateSaveUI();}
 // A single writer, with at most one newer snapshot pending. Never serialize on each keystroke.
 save(){this.rev++;this.renderRev++;this.sideRev++;return this.flushSave();}
 scheduleNoteSave(){this.rev++;this.lastEditAt=Date.now();if(!this.firstEditAt)this.firstEditAt=this.lastEditAt;this.updateSaveUI();if(!this.pref.auto)return;clearTimeout(this.saveTimer);const elapsed=Date.now()-this.firstEditAt;this.saveTimer=setTimeout(()=>this.flushSave(),Math.max(0,Math.min(this.pref.delay,5000-elapsed)));}
 flushSave(){clearTimeout(this.saveTimer);this.saveTimer=null;this.firstEditAt=0;if(this.writing)return this.writing;if(this.savedRev===this.rev)return Promise.resolve(true);this.saveError=false;
 const job=async()=>{try{while(this.savedRev!==this.rev){const version=this.rev;const snapshot=clone(this.db);await this.saveData(snapshot);this.savedRev=version;}return true;}catch(e){this.saveError=true;console.error('Noctilucent save failed',e);new Notice(T('Noctilucent：儲存失敗，請保留插件並按儲存重試。'));return false;}finally{this.writing=null;this.updateSaveUI();}};
 this.writing=Promise.resolve().then(job);this.updateSaveUI();return this.writing;}
 isEditingNote(){const el=this.focusedEditor;return !!(el?.isConnected&&(el.ownerDocument.activeElement===el||this.editors.get(el)?.composing));}
 releaseEditors(root){if(!root)return;for(const [el] of this.editors)if(root.contains(el)){this.editors.delete(el);if(this.focusedEditor===el)this.focusedEditor=null;}}
 saveLabelForEditor(el){const x=this.editors.get(el);if(!x)return {label:this.saveError?T('儲存失敗 · 請重試'):this.writing?T('儲存中…'):this.savedRev!==this.rev?T('等待儲存'):T('已儲存'),state:this.saveError?'error':this.savedRev===this.rev&&!this.writing?'saved':'pending'};if(this.saveError)return {label:T('儲存失敗 · 請重試'),state:'error'};if(this.writing)return {label:T('儲存中…'),state:'pending'};const a=this.db.items.find(i=>i.id===x.id);if(!a)return {label:T('等待儲存'),state:'pending'};const note=typeof a.note==='string'?a.note:'';const draft=typeof el.value==='string'?el.value:'';if(draft!==note||this.savedRev!==this.rev)return {label:T('等待儲存'),state:'pending'};return {label:T('已儲存'),state:'saved'};}
 updateSaveUI(only=null){const active=this.isEditingNote()?this.focusedEditor:null;for(const [el,x] of (only?[[only,this.editors.get(only)]]:active?[[active,this.editors.get(active)]]:this.editors)){if(!el.isConnected){this.editors.delete(el);continue;}if(!x)continue;const {label,state}=this.saveLabelForEditor(el);if(x.status.hidden===this.pref.status)x.status.hidden=!this.pref.status;if(x.button.hidden===this.pref.button)x.button.hidden=!this.pref.button;if(x.status.textContent!==label)x.status.textContent=label;if(x.status.dataset.state!==state)x.status.dataset.state=state;}}
 bindEditor(el,a,parent,onSaved=null){const d=el.ownerDocument,row=d.createElement('div');row.className='noctilucent-save-row';const status=d.createElement('span');status.className='noctilucent-save-status';status.setAttribute('role','status');status.textContent=T('等待儲存');status.dataset.state='pending';const button=d.createElement('button');button.textContent=T('儲存');button.type='button';row.append(status,button);parent.append(row);const x={id:a.id,status,button,row,composing:false};this.editors.set(el,x);el.addEventListener('focus',()=>{this.focusedEditor=el;this.updateSaveUI(el);});
 const commit=()=>{if(!x.composing)this.updateNote(a.id,el.value,el);this.updateSaveUI(el);};el.addEventListener('compositionstart',()=>{x.composing=true;this.updateSaveUI(el);});el.addEventListener('compositionend',()=>{x.composing=false;commit();});el.addEventListener('input',e=>{if(!e.isComposing)commit();e.stopPropagation();});for(const type of ['keydown','keyup','keypress','compositionstart','compositionupdate','compositionend'])el.addEventListener(type,e=>e.stopPropagation());
 el.addEventListener('blur',()=>{if(x.composing)return;commit();if(this.focusedEditor===el)this.focusedEditor=null;this.flushSave();this.updateSaveUI(el);setTimeout(()=>{if(!this.isEditingNote()){this.syncNoteUI();this.scan();}},0);});
 const manual=()=>{if(x.composing)return;commit();this.updateSaveUI(el);return this.flushSave();};button.addEventListener('mousedown',e=>e.preventDefault());button.onclick=async()=>{if(x.composing||x.manualPending)return;const value=el.value;x.manualPending=true;try{const ok=await manual();if(ok===true&&el.isConnected&&!x.composing&&el.value===value&&this.savedRev===this.rev)onSaved?.();}finally{x.manualPending=false;this.updateSaveUI(el);}};el.addEventListener('keydown',e=>{if(!e.isComposing&&!x.composing&&(e.ctrlKey||e.metaKey)&&!e.altKey&&String(e.key).toLowerCase()==='s'){e.preventDefault();e.stopPropagation();manual();}});queueMicrotask(()=>this.updateSaveUI(el));return x;}
 updateNote(id,note,source){const a=this.db.items.find(x=>x.id===id);if(!a||a.note===note)return;const had=!!a.note;a.note=note;a.modified=Date.now();for(const v of this.mdViews?.values()||[]){const marker=v.officeMarkers?.get(id)?.button;if(marker){marker.textContent=note?'▣':'+';marker.title=note?T('開啟批註'):T('新增批註／編輯批註');marker.setAttribute('aria-label',marker.title);}}this.pendingNoteUI.add(id);if(had!==!!note)this.renderRev++;this.scheduleNoteSave();}
 syncNoteUI(){if(!this.pendingNoteUI.size||this.isEditingNote())return;for(const id of this.pendingNoteUI){const a=this.db.items.find(x=>x.id===id);if(!a)continue;for(const [el,x] of this.editors)if(x.id===id&&!x.composing&&el.ownerDocument.activeElement!==el&&el.value!==a.note)el.value=a.note;for(const v of this.views.values())if(v.previewId===id)this.hidePreview(v);}this.pendingNoteUI.clear();this.sideRev++;this.refreshSidebars();}

 scan(){this.epubAdapter?.refresh();this.applyRecoveryResults();const live=new Set();for(const leaf of (this.moduleEnabled('pdf')?this.app.workspace.getLeavesOfType('pdf'):[])){const root=leaf.view.containerEl;const path=leaf.view.file?.path;if(!root||!path)continue;let v=this.views.get(root);if(v&&v.path!==path){this.dispose(v);this.views.delete(root);v=null;}if(!v){v={root,path,layers:new Map(),cards:new Map()};this.views.set(root,v);this.toolbar(v);}this.ensureToolbar(v);if(v.overlay)this.syncOverlay(v);live.add(root);const sources=[root];for(const frame of root.querySelectorAll('iframe'))try{if(frame.contentDocument?.body)sources.push(frame.contentDocument.body);}catch{};v.sources=sources;this.syncPdfEraserCursor(v);this.updateStickyPages(v);this.updateAreaPages(v);for(const s of sources){this.attach(s.ownerDocument);if(s.ownerDocument!==root.ownerDocument)s.ownerDocument.body?.classList.toggle('noctilucent-eraser-pdf-document',this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path);for(const p of s.querySelectorAll('.page[data-page-number]'))this.render(v,p);}for(const [p,l] of v.layers)if(!p.isConnected||!sources.some(s=>s.contains(p))){l.remove();v.layers.delete(p);} const scanTooltipRects=(v.cards.size||v.preview)?[...v.root.ownerDocument.querySelectorAll('.vittra-tooltip')].map(el=>el.getBoundingClientRect()):[];for(const [id,c] of v.cards){const a=this.db.items.find(x=>x.id===id);if(a&&!c.contains(c.ownerDocument.activeElement))this.positionCard(v,a,c,scanTooltipRects);if(a&&area(a)){const select=c.querySelector('.noctilucent-area-controls select'),range=c.querySelector('.noctilucent-area-controls input');if(select&&select.value!==a.areaStyle)select.value=a.areaStyle;if(range&&range!==range.ownerDocument.activeElement&&range.value!==String(Math.round(a.opacity*100))){range.value=Math.round(a.opacity*100);range.nextElementSibling.textContent=range.value+'%';}}}if(v.preview){const a=this.db.items.find(x=>x.id===v.previewId);if(a)this.positionCard(v,a,v.preview,scanTooltipRects);else this.hidePreview(v);} }
 for(const [r,v] of this.views)if(!live.has(r)){this.dispose(v);this.views.delete(r);}for(const [d,fn] of this.docs)if(![...this.views.values()].some(v=>v.sources?.some(s=>s.ownerDocument===d))){d.removeEventListener('mouseup',fn);if(this.eraseDocuments?.has(d)){const e=this.eraseDocuments.get(d);d.removeEventListener('pointerdown',e.down,true);d.removeEventListener('click',e.click,true);this.eraseDocuments.delete(d);d.body?.classList.remove('noctilucent-eraser-pdf-document');d.getElementById('noctilucent-pdf-eraser-cursor')?.remove();}this.detachSticky(d);d.defaultView?.removeEventListener('keydown',this.undoKeys.get(d),true);this.undoKeys.delete(d);this.docs.delete(d);} this.refreshSidebars(); }
 attach(d){if(this.docs.has(d))return;if(d!==document){const down=e=>this.erasePointerDown(e),click=e=>this.eraseClick(e);d.addEventListener('pointerdown',down,true);d.addEventListener('click',click,true);(this.eraseDocuments??=new Map()).set(d,{down,click});}const fn=e=>{if(this.eraserTarget?.kind==='pdf')return;if(this.areaGesture||this.areaView||Date.now()-(this.lastAreaUp||0)<250)return;if(this.lastStickyDown&&Date.now()-this.lastStickyDown<700)return;if(e.button!==0||e.target?.closest?.('.noctilucent-layer,.noctilucent-toolbar,.noctilucent-card,.noctilucent-sidebar'))return;const s=d.getSelection();if(s&&!s.isCollapsed){const snap=this.capture(d,s);if(snap){this.snap=snap;snap.v.selection=snap;if(this.toolbarState(snap.v,'pdf').continuous)this.add(false,snap); }return;} const page=e.target?.closest?.('.page[data-page-number]');if(!page)return;const v=this.findView(page);if(!v||this.toolbarState(v,'pdf').continuous)return;const b=this.pageLayer(v,page).getBoundingClientRect();const x=(e.clientX-b.left)/b.width,y=(e.clientY-b.top)/b.height;const hit=this.db.items.filter(a=>a.path===v.path&&a.page===+page.dataset.pageNumber&&!area(a)&&(a.rects||[]).some(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)).at(-1);if(hit)this.card(v,hit);};d.addEventListener('mouseup',fn);this.docs.set(d,fn);this.attachSticky(d);const key=e=>this.handleUndoKey(d,e);d.defaultView.addEventListener('keydown',key,true);this.undoKeys.set(d,key);}
 // Free-position annotations use normalized page coordinates; old highlight records stay unchanged.
 stickyState(a){if(area(a))return {rects:clone(a.rects),rotation:a.rotation,color:a.color,areaStyle:a.areaStyle,opacity:a.opacity};return {anchor:clone(a.anchor),rotation:a.rotation,color:a.color};}
 recordSticky(a){this.invalidateRedo(a.path);this.undoHistory.push({kind:'sticky-update',id:a.id,path:a.path,before:this.stickyState(a)});}
 removeStickyItem(a){this.db.items=this.db.items.filter(x=>x.id!==a.id);for(const v of this.views.values()){const c=v.cards.get(a.id);this.releaseEditors(c);c?.remove();v.cards.delete(a.id);if(v.previewId===a.id)this.hidePreview(v);}}
 cancelSticky(){const v=this.stickyView;this.stickyView=null;if(!v)return;v.stickyBtn?.setAttribute('aria-pressed','false');for(const p of v.stickyPages||[])p.classList.remove('noctilucent-placement');v.stickyPages?.clear();}
 updateStickyPages(v){if(this.stickyView!==v)return;v.stickyPages??=new Set();for(const p of v.stickyPages)if(!p.isConnected){p.classList.remove('noctilucent-placement');v.stickyPages.delete(p);}for(const source of v.sources||[v.root])for(const p of source.querySelectorAll('.page[data-page-number]'))if(!v.stickyPages.has(p)){p.classList.add('noctilucent-placement');v.stickyPages.add(p);}}
 toggleSticky(v){if(this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();}this.cancelArea();if(this.stickyView===v){this.cancelSticky();return;}this.cancelSticky();this.toolbarState(v,'pdf').continuous=false;v.selection=null;this.snap=null;if(v.modeBtn)v.modeBtn.textContent=T('連續：關');this.stickyView=v;v.stickyBtn?.setAttribute('aria-pressed','true');v.root.ownerDocument.getSelection()?.removeAllRanges();this.updateStickyPages(v);new Notice(T('點擊 PDF 任意位置新增自由批註，Esc 取消'));}
 pagePoint(v,p,e){const b=this.pageLayer(v,p).getBoundingClientRect();if(!b.width||!b.height)return null;return {x:clamp01((e.clientX-b.left)/b.width),y:clamp01((e.clientY-b.top)/b.height)};}
 createSticky(v,p,anchor){if(!anchor||!this.views.has(v.root)||!p.isConnected)return;this.cancelSticky();const now=Date.now();const a={id:globalThis.crypto.randomUUID(),type:'sticky-note',path:v.path,page:+p.dataset.pageNumber,rotation:this.rotation(p),anchor,color:COLORS[this.toolbarState(v,'pdf').color]||COLORS[0],note:'',created:now,modified:now};this.db.items.push(a);this.invalidateRedo(a.path);this.undoHistory.push({kind:'create',id:a.id,path:a.path});this.save();this.scan();this.card(v,a);v.cards.get(a.id)?.querySelector('textarea')?.focus();return a;}
 stickyDisplay(a,p){const delta=((Number(this.rotation(p))-Number(a.rotation||0))%360+360)%360;const {x,y}=a.anchor;return delta===90?{x:1-y,y:x}:delta===180?{x:1-x,y:1-y}:delta===270?{x:y,y:1-x}:{x,y};}
 attachSticky(d){this.attachArea(d);const context=e=>{if(this.areaView||e.target?.closest?.('.noctilucent-area-marker,.noctilucent-area-handle'))return;if(e.shiftKey||e.defaultPrevented||e.target?.closest?.('.noctilucent-marker,.noctilucent-card,.noctilucent-toolbar,.noctilucent-sidebar,a,button,input,textarea'))return;const p=e.target?.closest?.('.page[data-page-number]'),v=p&&this.findView(p);if(!v||!d.getSelection()?.isCollapsed&&d.getSelection()?.toString())return;const anchor=this.pagePoint(v,p,e);if(!anchor)return;e.preventDefault();e.stopImmediatePropagation();const menu=new Menu();menu.addItem(i=>i.setTitle(T('新增自由批註')).setIcon('sticky-note').onClick(()=>this.createSticky(v,p,anchor)));menu.showAtMouseEvent(e);};const down=e=>{if(e.button!==0||!this.stickyView)return;const p=e.target?.closest?.('.page[data-page-number]'),v=p&&this.findView(p);if(v!==this.stickyView)return;e.preventDefault();e.stopImmediatePropagation();d.getSelection()?.removeAllRanges();this.lastStickyDown=Date.now();this.createSticky(v,p,this.pagePoint(v,p,e));};const key=e=>{if(e.key==='Escape'&&this.stickyView){this.cancelSticky();e.preventDefault();e.stopPropagation();}};d.addEventListener('contextmenu',context,true);d.addEventListener('pointerdown',down,true);d.defaultView?.addEventListener('keydown',key,true);this.stickyListeners.set(d,{context,down,key});}
 detachSticky(d){this.detachArea(d);const x=this.stickyListeners.get(d);if(!x)return;d.removeEventListener('contextmenu',x.context,true);d.removeEventListener('pointerdown',x.down,true);d.defaultView?.removeEventListener('keydown',x.key,true);this.stickyListeners.delete(d);}
 renderSticky(v,p,l,a){const d=p.ownerDocument,b=d.createElement('button');b.className='noctilucent-marker noctilucent-sticky-marker';b.dataset.annotationId=a.id;b.type='button';b.setAttribute('aria-label',T('自由批註：點擊編輯，拖曳移動'));setIcon(b,'sticky-note');b.style.background=a.color;const position=q=>{b.style.left=q.x*100+'%';b.style.top=q.y*100+'%';};position(this.stickyDisplay(a,p));l.append(b);let moved=false,start=null;const cleanup=()=>{start=null;b.classList.remove('is-dragging');};b.addEventListener('pointerdown',e=>{if(this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path)return;if(e.button!==0||this.stickyView)return;e.preventDefault();e.stopPropagation();moved=false;start={x:e.clientX,y:e.clientY};b.setPointerCapture(e.pointerId);b.classList.add('is-dragging');clearTimeout(v.hoverTimer);this.hidePreview(v);});b.addEventListener('pointermove',e=>{if(!start)return;if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4)moved=true;if(moved){const pos=this.pagePoint(v,p,e);if(pos)position(pos);}});b.addEventListener('pointerup',e=>{if(!start)return;const pos=this.pagePoint(v,p,e);cleanup();if(moved&&pos){this.recordSticky(a);a.anchor=pos;a.rotation=this.rotation(p);a.modified=Date.now();this.save();setTimeout(()=>this.scan(),0);}});b.addEventListener('pointercancel',()=>{cleanup();position(this.stickyDisplay(a,p));});b.addEventListener('lostpointercapture',()=>{if(start){cleanup();position(this.stickyDisplay(a,p));}});b.addEventListener('click',e=>{e.stopPropagation();if(moved){moved=false;return;}this.hidePreview(v);this.card(v,a);});b.addEventListener('pointerenter',()=>{if(!a.note||start)return;clearTimeout(v.hoverTimer);v.hoverTimer=setTimeout(()=>this.preview(v,a),350);});b.addEventListener('pointerleave',()=>{clearTimeout(v.hoverTimer);this.hidePreview(v);});}
 // Area rectangles are stored in the page orientation at creation or last edit.
 areaRect(a,p){const r=a.rects[0],delta=((Number(this.rotation(p))-Number(a.rotation||0))%360+360)%360;return delta===90?{x:1-r.y-r.h,y:r.x,w:r.h,h:r.w}:delta===180?{x:1-r.x-r.w,y:1-r.y-r.h,w:r.w,h:r.h}:delta===270?{x:r.y,y:1-r.x-r.w,w:r.h,h:r.w}:{...r};}
 rectBetween(a,b){return {x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}
 rectStyle(el,r){Object.assign(el.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});}
 areaPaint(el,a){const style=a.areaStyle||'both',opacity=Number.isFinite(a.opacity)?clamp01(a.opacity):.15;el.style.background=style==='border'?'transparent':a.color+Math.round(opacity*255).toString(16).padStart(2,'0');el.style.border=style==='fill'?'none':'2px solid '+a.color;}
 updateAreaPages(v){if(this.areaView!==v)return;v.areaPages??=new Set();for(const p of v.areaPages)if(!p.isConnected){p.classList.remove('noctilucent-area-placement');v.areaPages.delete(p);}for(const source of v.sources||[v.root])for(const p of source.querySelectorAll('.page[data-page-number]'))if(!v.areaPages.has(p)){v.areaPages.add(p);p.classList.add('noctilucent-area-placement');}}
 cancelArea(){const g=this.areaGesture;this.areaGesture=null;g?.cleanup?.();const v=this.areaView;this.areaView=null;if(v){v.areaBtn?.setAttribute('aria-pressed','false');for(const p of v.areaPages||[])p.classList.remove('noctilucent-area-placement');v.areaPages?.clear();}}
 toggleArea(v){if(this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();}if(this.areaView===v){this.cancelArea();return;}this.cancelArea();this.cancelSticky();this.toolbarState(v,'pdf').continuous=false;v.selection=null;this.snap=null;if(v.modeBtn)v.modeBtn.textContent=T('連續：關');this.areaView=v;v.areaBtn?.setAttribute('aria-pressed','true');this.updateAreaPages(v);new Notice(T('按住左鍵拖曳框選區域，Esc 取消'));}
 exitAreaEditOutside(e){const page=e.target?.closest?.('.page[data-page-number]');if(!page||e.target?.closest?.('.noctilucent-area-handle,.noctilucent-card,.noctilucent-toolbar,.noctilucent-sidebar'))return;const clicked=this.findView(page);if(!clicked)return;for(const v of this.views.values()){if(!v.areaEditId)continue;const a=this.db.items.find(x=>x.id===v.areaEditId);if(a&&v===clicked&&+page.dataset.pageNumber===a.page){const q=this.pagePoint(v,page,e),r=this.areaRect(a,page);if(q&&q.x>=r.x&&q.x<=r.x+r.w&&q.y>=r.y&&q.y<=r.y+r.h)continue;}v.areaEditId=null;for(const [p,l] of v.layers){if(l.querySelector('.noctilucent-area-handle')){for(const h of l.querySelectorAll('.noctilucent-area-handle'))h.remove();delete l.dataset.revision;delete l.dataset.key;}}}}
 attachArea(d){const down=e=>{if(e.button===0&&!this.areaGesture)this.exitAreaEditOutside(e);if(e.button!==0||!this.areaView||this.areaGesture)return;const p=e.target?.closest?.('.page[data-page-number]'),v=p&&this.findView(p);if(v!==this.areaView||!p)return;e.preventDefault();e.stopImmediatePropagation();d.getSelection()?.removeAllRanges();const l=this.pageLayer(v,p),start=this.pagePoint(v,p,e);if(!start)return;const box=d.createElement('div');box.className='noctilucent-area-draft';l.append(box);const color=COLORS[this.db.color]||COLORS[0];this.areaPaint(box,{color,areaStyle:'both',opacity:.15});this.rectStyle(box,this.rectBetween(start,start));this.rectGesture(v,p,l,e,box,start,null,'create');};const key=e=>{if(e.key==='Escape'&&(this.areaView||this.areaGesture||[...this.views.values()].some(v=>v.areaEditId))){this.cancelArea();for(const v of this.views.values()){v.areaEditId=null;for(const l of v.layers.values())delete l.dataset.revision;}this.scan();e.preventDefault();e.stopPropagation();}};d.addEventListener('pointerdown',down,true);d.defaultView?.addEventListener('keydown',key,true);(this.areaListeners??=new Map()).set(d,{down,key});}
 detachArea(d){const x=this.areaListeners?.get(d);if(!x)return;d.removeEventListener('pointerdown',x.down,true);d.defaultView?.removeEventListener('keydown',x.key,true);this.areaListeners.delete(d);}
 rectGesture(v,p,l,e,box,start,a,action){if(this.areaGesture)return;const d=p.ownerDocument,w=d.defaultView,pid=e.pointerId,original=a?this.areaRect(a,p):null;let result=original,frame=null;const update=m=>{const q=this.pagePoint(v,p,m);if(!q)return;if(action==='create')result=this.rectBetween(start,q);else if(action==='move')result={...original,x:Math.max(0,Math.min(1-original.w,original.x+q.x-start.x)),y:Math.max(0,Math.min(1-original.h,original.y+q.y-start.y))};else{const left=original.x,top=original.y,right=left+original.w,bottom=top+original.h;const x=action.includes('w')?Math.min(right-.003,q.x):left,y=action.includes('n')?Math.min(bottom-.003,q.y):top,xx=action.includes('e')?Math.max(left+.003,q.x):right,yy=action.includes('s')?Math.max(top+.003,q.y):bottom;result={x:Math.max(0,x),y:Math.max(0,y),w:xx-Math.max(0,x),h:yy-Math.max(0,y)};}if(frame===null)frame=w.requestAnimationFrame(()=>{frame=null;this.rectStyle(box,result);});};const move=m=>{if(m.pointerId!==pid)return;m.preventDefault();m.stopImmediatePropagation();update(m);};const cleanup=()=>{if(p.hasPointerCapture?.(pid))p.releasePointerCapture(pid);if(frame!==null)w.cancelAnimationFrame(frame);d.removeEventListener('pointermove',move,true);d.removeEventListener('pointerup',end,true);d.removeEventListener('pointercancel',cancel,true);w.removeEventListener('blur',cancel);box.remove();};const cancel=()=>{this.cancelArea();this.scan();};const end=m=>{if(m.pointerId!==pid)return;m.preventDefault();m.stopImmediatePropagation();update(m);this.lastAreaUp=Date.now();this.areaGesture=null;cleanup();if(action==='create')this.cancelArea();if(!result||!p.isConnected||!this.views.has(v.root))return;const b=l.getBoundingClientRect();if(result.w*b.width<5||result.h*b.height<5){this.scan();return;}if(a){if(JSON.stringify(result)!==JSON.stringify(original)){this.recordSticky(a);a.rects=[result];a.rotation=this.rotation(p);a.modified=Date.now();this.save();this.scan();}}else this.createArea(v,p,result);};this.areaGesture={v,layer:l,cleanup};try{p.setPointerCapture(pid);}catch{}d.addEventListener('pointermove',move,true);d.addEventListener('pointerup',end,true);d.addEventListener('pointercancel',cancel,true);w.addEventListener('blur',cancel);}
 createArea(v,p,r){const now=Date.now(),a={id:globalThis.crypto.randomUUID(),type:'area',path:v.path,page:+p.dataset.pageNumber,rotation:this.rotation(p),rects:[r],areaStyle:'both',opacity:.15,color:COLORS[this.toolbarState(v,'pdf').color]||COLORS[0],note:'',created:now,modified:now};this.db.items.push(a);this.invalidateRedo(a.path);this.undoHistory.push({kind:'create',id:a.id,path:a.path});this.save();this.scan();this.card(v,a);v.cards.get(a.id)?.querySelector('textarea')?.focus();return a;}
 changeArea(a,changes){if(!this.db.items.includes(a)||Object.keys(changes).every(k=>a[k]===changes[k]))return;this.recordSticky(a);Object.assign(a,changes,{modified:Date.now()});this.save();this.scan();}
 renderArea(v,p,l,a){const d=p.ownerDocument,r=this.areaRect(a,p),box=d.createElement('div');box.className='noctilucent-area-rect';this.rectStyle(box,r);this.areaPaint(box,a);l.append(box);const b=d.createElement('button');b.className='noctilucent-marker noctilucent-sticky-marker noctilucent-area-marker';b.dataset.annotationId=a.id;b.type='button';b.title=T('區域批註：點擊編輯，右鍵調整');setIcon(b,'sticky-note');Object.assign(b.style,{left:(r.x+r.w)*100+'%',top:r.y*100+'%',background:a.color});l.append(b);b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=()=>{if(this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path)return;this.hidePreview(v);this.card(v,a);};b.onpointerenter=()=>{if(!a.note||this.areaView||this.areaGesture||this.eraserTarget?.kind==='pdf')return;clearTimeout(v.hoverTimer);v.hoverTimer=setTimeout(()=>this.preview(v,a),350);};b.onpointerleave=()=>{clearTimeout(v.hoverTimer);this.hidePreview(v);};const edit=()=>{v.areaEditId=v.areaEditId===a.id?null:a.id;for(const layer of v.layers.values())delete layer.dataset.revision;this.scan();};b.addEventListener('contextmenu',e=>{if(e.shiftKey)return;e.preventDefault();e.stopPropagation();const menu=new Menu();menu.addItem(i=>i.setTitle(T('編輯批註')).setIcon('sticky-note').onClick(()=>this.card(v,a)));menu.addItem(i=>i.setTitle(v.areaEditId===a.id?T('結束調整'):T('移動／調整區域')).setIcon('move').onClick(edit));menu.addItem(i=>i.setTitle(T('複製區域圖片')).setIcon('copy').onClick(()=>this.copyAreaImage(v,a)));menu.addItem(i=>i.setTitle(T('刪除區域')).setIcon('trash').onClick(()=>this.deleteFromSidebar(a.id)));menu.showAtMouseEvent(e);});if(v.areaEditId===a.id){const handles=[['move',.5,.5],['nw',0,0],['n',.5,0],['ne',1,0],['w',0,.5],['e',1,.5],['sw',0,1],['s',.5,1],['se',1,1]];for(const [kind,x,y] of handles){const h=d.createElement('button');h.className='noctilucent-area-handle';h.title=kind==='move'?T('移動區域'):T('調整大小');h.dataset.kind=kind;Object.assign(h.style,{left:(r.x+r.w*x)*100+'%',top:(r.y+r.h*y)*100+'%'});if(kind==='move')setIcon(h,'move');l.append(h);h.onpointerdown=e=>{if(e.button!==0||this.areaView||this.areaGesture)return;e.preventDefault();e.stopPropagation();const start=this.pagePoint(v,p,e);if(!start)return;const draft=d.createElement('div');draft.className='noctilucent-area-draft';this.rectStyle(draft,r);this.areaPaint(draft,a);l.append(draft);this.rectGesture(v,p,l,e,draft,start,a,kind);};}}}
 areaControls(v,a,c,ta){const d=c.ownerDocument,row=d.createElement('div');row.className='noctilucent-area-controls';const select=d.createElement('select');select.setAttribute('aria-label',T('區域樣式'));for(const [value,text] of [['fill',T('半透明填色')],['border',T('彩色外框')],['both',T('填色＋外框')]]){const o=d.createElement('option');o.value=value;o.textContent=text;select.append(o);}select.value=a.areaStyle;select.onchange=()=>this.changeArea(a,{areaStyle:select.value});const opacity=d.createElement('input');opacity.type='range';opacity.min='5';opacity.max='60';opacity.step='5';opacity.value=Math.round(a.opacity*100);opacity.setAttribute('aria-label',T('填色不透明度'));const label=d.createElement('span');label.textContent=opacity.value+'%';opacity.oninput=()=>label.textContent=opacity.value+'%';opacity.onchange=()=>this.changeArea(a,{opacity:Number(opacity.value)/100});opacity.onblur=()=>{opacity.value=Math.round(a.opacity*100);label.textContent=opacity.value+'%';};const copy=d.createElement('button');copy.textContent=T('複製圖片');copy.onclick=()=>this.copyAreaImage(v,a);const edit=d.createElement('button');edit.textContent=T('調整區域');edit.onclick=()=>{v.areaEditId=v.areaEditId===a.id?null:a.id;for(const l of v.layers.values())delete l.dataset.revision;this.scan();};row.append(select,opacity,label,copy,edit);c.insertBefore(row,ta);c.style.height='275px';}
 async cropArea(v,a){const p=(v.sources||[v.root]).flatMap(s=>[...s.querySelectorAll('.page[data-page-number]')]).find(p=>+p.dataset.pageNumber===a.page);const canvas=p?.querySelector('.canvasWrapper canvas')||p?.querySelector('canvas');if(!canvas?.width||!canvas.height)throw Error(T('PDF 頁面尚未完成渲染'));const r=this.areaRect(a,p),page=this.pageLayer(v,p).getBoundingClientRect(),cb=canvas.getBoundingClientRect();if(!cb.width||!cb.height)throw Error(T('PDF 畫布不可見'));const x=Math.max(0,Math.floor((page.left+r.x*page.width-cb.left)*canvas.width/cb.width)),y=Math.max(0,Math.floor((page.top+r.y*page.height-cb.top)*canvas.height/cb.height)),right=Math.min(canvas.width,Math.ceil((page.left+(r.x+r.w)*page.width-cb.left)*canvas.width/cb.width)),bottom=Math.min(canvas.height,Math.ceil((page.top+(r.y+r.h)*page.height-cb.top)*canvas.height/cb.height));const out=p.ownerDocument.createElement('canvas');out.width=right-x;out.height=bottom-y;if(right<=x||bottom<=y)throw Error(T('區域不在畫布內'));out.getContext('2d').drawImage(canvas,x,y,right-x,bottom-y,0,0,out.width,out.height);const blob=await new Promise((resolve,reject)=>out.toBlob(b=>b?resolve(b):reject(Error(T('PNG 轉換失敗'))),'image/png'));return blob;}
 async copyAreaImage(v,a){try{const blob=await this.cropArea(v,a);const win=v.root.ownerDocument.defaultView;await win.navigator.clipboard.write([new win.ClipboardItem({'image/png':blob})]);new Notice(T('已複製原始區域圖片'));}catch(e){new Notice(T('無法複製圖片：')+e.message);}}
 async copyAreaWithNote(id){try{let a=this.db.items.find(x=>x.id===id);if(!area(a))throw Error(T('找不到區域批註'));const locate=()=>[...this.views.values()].find(v=>v.path===a.path&&(v.sources||[v.root]).some(s=>{const p=s.querySelector('.page[data-page-number="'+Number(a.page)+'"]');const c=p?.querySelector('.canvasWrapper canvas')||p?.querySelector('canvas');const b=c?.getBoundingClientRect();return c?.width&&c.height&&b?.width&&b.height;}));let v=locate();if(!v){await this.jumpAnnotation(id);for(let i=0;i<20&&!v;i++){v=locate();if(!v)await new Promise(r=>setTimeout(r,150));}}if(!v)throw Error(T('請先開啟原始 PDF 並等待該頁渲染'));a=this.db.items.find(x=>x.id===id);if(!area(a))throw Error(T('批註已不存在'));const blob=await this.cropArea(v,a),win=v.root.ownerDocument.defaultView;const data=await new Promise((resolve,reject)=>{const r=new win.FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error(T('圖片編碼失敗')));r.readAsDataURL(blob);});const note=a.note||'',esc=t=>String(t).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));const html='<div><p><img src="'+data+T('" alt="PDF 區域圖片"></p>')+(note?'<p>'+esc(note).replace(/\r\n|\r|\n/g,'<br>')+'</p>':'')+'</div>';const plain=note;let native=null;try{native=require('electron').clipboard;}catch{}if(native?.write)native.write({html,text:plain});else await win.navigator.clipboard.write([new win.ClipboardItem({'text/html':new win.Blob([html],{type:'text/html'}),'text/plain':new win.Blob([plain],{type:'text/plain'})})]);new Notice(T('已複製區域圖片＋批註（富文字貼上）'));}catch(e){new Notice(T('無法複製圖片＋批註：')+e.message);}}

 findView(node){if(!node)return;return [...this.views.values()].find(v=>v.sources?.some(s=>s.contains(node)));}
 pageLayer(v,p){let l=v.layers.get(p);if(!l||!l.isConnected){l=p.ownerDocument.createElement('div');l.className='noctilucent-layer';Object.assign(l.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'4'});p.append(l);v.layers.set(p,l);}return l;}
 rangeRects(range,layer){const d=layer.ownerDocument,box=layer.getBoundingClientRect(),empty={rects:[],smartRects:[],bridgeCount:0};if(!box.width||!box.height)return empty;const tl=layer.parentElement.querySelector('.textLayer');if(!tl)return empty;const walker=d.createTreeWalker(tl,4),segments=[];let n;while(n=walker.nextNode()){if(!n.length||!range.intersectsNode(n))continue;const r=d.createRange();r.selectNodeContents(n);if(n===range.startContainer)r.setStart(n,range.startOffset);if(n===range.endContainer)r.setEnd(n,range.endOffset);if(r.collapsed)continue;const rects=[];for(const q of r.getClientRects()){const x=Math.max(q.left,box.left),y=Math.max(q.top,box.top),right=Math.min(q.right,box.right),bottom=Math.min(q.bottom,box.bottom);if(right-x>.3&&bottom-y>.3)rects.push({x:(x-box.left)/box.width,y:(y-box.top)/box.height,w:(right-x)/box.width,h:(bottom-y)/box.height});}segments.push({text:String(r),rects});}
 const base=mergeLegacyRects(segments.flatMap(q=>q.rects),box.width);const smart=this.pref.smartGeometry&&segments.some(q=>badQuoteChar.test(q.text))?smartGapRects(segments,box.width,box.height):{rects:base,count:0};return {rects:base,smartRects:smart.rects,bridgeCount:smart.count,bridgeDetails:smart.details||[]};}
 capture(d,s){if(!s.rangeCount)return;const range=s.getRangeAt(0);const el=n=>n.nodeType===1?n:n.parentElement;const a=el(range.startContainer)?.closest('.page[data-page-number]'),b=el(range.endContainer)?.closest('.page[data-page-number]');if(!a||a!==b||!el(range.startContainer)?.closest('.textLayer')||!el(range.endContainer)?.closest('.textLayer'))return;const v=this.findView(a);if(!v)return;const geometry=this.rangeRects(range,this.pageLayer(v,a));if(!geometry.rects.length)return;const text=s.toString().trim(),page=+a.dataset.pageNumber;const view=badQuoteChar.test(text)?this.app.workspace.getLeavesOfType('pdf').find(l=>l.view.containerEl===v.root&&l.view.file?.path===v.path)?.view:null;return {v,path:v.path,page,rotation:this.rotation(a),...geometry,text,native:view?nativePageInfo(view,a,page):null,at:Date.now()};}

 overlap(a,b){let total=0,area=a.reduce((s,r)=>s+r.w*r.h,0);for(const r of a)for(const q of b)total+=Math.max(0,Math.min(r.x+r.w,q.x+q.w)-Math.max(r.x,q.x))*Math.max(0,Math.min(r.y+r.h,q.y+q.h)-Math.max(r.y,q.y));return total/Math.max(area,1e-10);}
 rotation(p){return p.dataset.mainRotation||p.querySelector('.textLayer')?.dataset.mainRotation||p.querySelector('.canvasWrapper')?.dataset.mainRotation||'0';}
 historyPath(d,target){const direct=this.findView(target);if(direct)return direct.path;const side=target?.closest?.('.noctilucent-sidebar');if(side){const leaf=this.app.workspace.getLeavesOfType(SIDEBAR).find(l=>l.view.root===side);return leaf?.view.path||null;}const ws=this.app.workspace;const active=ws.activeLeaf;if(active?.view?.getViewType?.()==='pdf')return active.view.file?.path||null;return null;}
 handleUndoKey(d,e){if(e.key==='Escape'&&this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();return;}if(e.isComposing||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey))return;const k=String(e.key).toLowerCase();if(k==='s'){const el=e.target?.nodeType===1?e.target:d.activeElement;const x=this.editors.get(el);if(x&&!x.composing){e.preventDefault();e.stopImmediatePropagation();this.updateNote(x.id,el.value,el);this.flushSave();}return;}if(!['z','y'].includes(k))return;const target=e.target?.nodeType===1?e.target:e.target?.parentElement||d.activeElement;const editable=el=>el&&(el.isContentEditable||el.closest?.('textarea,input,select,[role="textbox"],.cm-editor,.noctilucent-card'));if(editable(target)||editable(d.activeElement))return;const path=this.historyPath(d,target);if(!path||!this.pathEnabled(path))return;const redo=k==='y';if(!(redo?this.redoHistory:this.undoHistory).some(h=>h.path===path))return;e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)(redo?this.redoHighlight(path):this.undoHighlight(path));}
 runHistoryCommand(redo){const path=this.sidebarPath();if(!path||!this.pathEnabled(path)){new Notice(T('請先開啟 PDF'));return;}if(!(redo?this.redoHighlight(path):this.undoHighlight(path)))new Notice(redo?T('沒有可重做的標記'):T('本次工作階段沒有可撤回的標記'));}
 undoHighlight(path){for(let i=this.undoHistory.length-1;i>=0;i--){const h=this.undoHistory[i];if(h.path!==path)continue;const a=this.db.items.find(x=>x.id===h.id);if(h.kind==='batch-delete'){if(!Array.isArray(h.items)){this.undoHistory.splice(i,1);continue;}const present=new Set(this.db.items.map(x=>x.id));for(const {index,item} of h.items)if(!present.has(item.id)){this.db.items.splice(Math.min(index,this.db.items.length),0,clone(item));present.add(item.id);}this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已撤回整批刪除'));return true;}if(h.kind==='erase'){if(a){this.undoHistory.splice(i,1);continue;}this.db.items.splice(Math.min(h.index,this.db.items.length),0,clone(h.item));this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已撤回擦除'));return true;}if(h.kind==='md-color'){if(!a||!['office-highlight','markdown-highlight'].includes(a.type)&&!epubType(a)){this.undoHistory.splice(i,1);continue;}h.afterColor=a.color;a.color=h.beforeColor;a.modified=Date.now();this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.mdRefresh();this.refreshSidebars();new Notice(T('已撤回高亮顏色'));return true;}if(h.kind==='epub-region-change'){
 if(!a||a.type!=='epub-region'){this.undoHistory.splice(i,1);continue;}
 h.after={epubRect:{...a.epubRect},areaStyle:a.areaStyle||'both',opacity:Number.isFinite(a.opacity)?a.opacity:.15};
 Object.assign(a,clone(h.before),{modified:Date.now()});this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();this.mdRefresh();return true;
 }if(h.kind==='sticky-delete'){if(a){this.undoHistory.splice(i,1);continue;}this.db.items.splice(Math.min(h.index,this.db.items.length),0,clone(h.item));this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();return true;}if(h.kind==='sticky-update'&&a){h.after=this.stickyState(a);Object.assign(a,clone(h.before),{modified:Date.now()});this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();return true;}if(!a){this.undoHistory.splice(i,1);continue;}if(h.kind==='create'){if(a.note&&!window.confirm(T('撤回此標記也會移除其文字批註，確定嗎？')))return false;h.item=JSON.parse(JSON.stringify(a));h.index=this.db.items.indexOf(a);this.db.items=this.db.items.filter(x=>x.id!==a.id);for(const v of this.views.values()){this.releaseEditors(v.cards.get(a.id));v.cards.get(a.id)?.remove();v.cards.delete(a.id);if(v.previewId===a.id)this.hidePreview(v);}}else{h.after={rects:JSON.parse(JSON.stringify(a.rects)),color:a.color};a.rects=h.before.rects;a.color=h.before.color;a.modified=Date.now();}this.undoHistory.splice(i,1);this.redoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已撤回標記'));return true;}return false;}
 invalidateRedo(path){this.redoHistory=this.redoHistory.filter(h=>h.path!==path);}
 redoHighlight(path){for(let i=this.redoHistory.length-1;i>=0;i--){const h=this.redoHistory[i];if(h.path!==path)continue;const a=this.db.items.find(x=>x.id===h.id);if(h.kind==='batch-delete'){if(!Array.isArray(h.items)){this.redoHistory.splice(i,1);continue;}const ids=new Set(h.items.map(x=>x.item.id));this.db.items=this.db.items.filter(x=>!ids.has(x.id));this.closeDocumentAnnotationCards(path,ids);this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已重做整批刪除'));return true;}if(h.kind==='erase'){if(!a){this.redoHistory.splice(i,1);continue;}h.item=clone(a);h.index=this.db.items.indexOf(a);this.db.items.splice(h.index,1);this.closeDocumentAnnotationCards(path,new Set([h.id]));this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已重做擦除'));return true;}if(h.kind==='md-color'){if(!a||(!['office-highlight','markdown-highlight'].includes(a.type)&&!epubType(a))||!h.afterColor){this.redoHistory.splice(i,1);continue;}a.color=h.afterColor;a.modified=Date.now();this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.mdRefresh();this.refreshSidebars();new Notice(T('已重做高亮顏色'));return true;}if(h.kind==='epub-region-change'){
 if(!a||a.type!=='epub-region'||!h.after){this.redoHistory.splice(i,1);continue;}
 Object.assign(a,clone(h.after),{modified:Date.now()});this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();this.mdRefresh();return true;
 }if(h.kind==='sticky-delete'&&a){h.item=clone(a);h.index=this.db.items.indexOf(a);this.removeStickyItem(a);this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();return true;}if(h.kind==='sticky-update'&&a&&h.after){Object.assign(a,clone(h.after),{modified:Date.now()});this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();return true;}if(h.kind==='sticky-delete'||h.kind==='sticky-update'){this.redoHistory.splice(i,1);continue;}if(h.kind==='create'){if(a||!h.item){this.redoHistory.splice(i,1);continue;}this.db.items.splice(Math.min(h.index,this.db.items.length),0,JSON.parse(JSON.stringify(h.item)));}else{if(!a||!h.after){this.redoHistory.splice(i,1);continue;}a.rects=JSON.parse(JSON.stringify(h.after.rects));a.color=h.after.color;a.modified=Date.now();}this.redoHistory.splice(i,1);this.undoHistory.push(h);this.save();this.scan();this.mdRefresh();new Notice(T('已重做標記'));return true;}return false;}

 add(comment,snap=this.snap){this.cancelArea();if(!snap||!snap.text||!this.views.has(snap.v.root)||snap.v.path!==snap.path){new Notice(T('請先在 PDF 同一頁選取文字。'));return;}const sig=JSON.stringify(snap.rects);let a=this.db.items.find(x=>!special(x)&&x.path===snap.path&&x.page===snap.page&&x.rotation===snap.rotation&&(JSON.stringify(x.rects)===sig||(x.text===snap.text&&this.overlap(snap.rects,x.rects)>.65)));if(!a){a={id:globalThis.crypto.randomUUID(),path:snap.path,page:snap.page,rotation:snap.rotation,rects:this.pref.smartGeometry?snap.smartRects||snap.rects:snap.rects,text:snap.text,color:COLORS[this.toolbarState(snap.v,'pdf').color]||COLORS[0],note:'',created:Date.now(),modified:Date.now()};if(this.pref.normalizeNew){Object.assign(a,normalizeNewQuote(a.text));if(a.normalizationStatus==='unresolved'&&!this.pref.symbolRecovery)new Notice(T('Noctilucent：擷取文字含未辨識符號，請核對 PDF 原文。'));}this.db.items.push(a);this.invalidateRedo(a.path);this.undoHistory.push({kind:'create',id:a.id,path:a.path});if(this.pref.smartGeometry&&snap.bridgeCount)a.geometryVersion=2;if(this.pref.normalizeNew&&this.pref.symbolRecovery&&badQuoteChar.test(a.text))this.startSymbolRecovery(a,snap);}else {const before={rects:JSON.parse(JSON.stringify(a.rects)),color:a.color};if(a.geometryVersion!==2)a.rects=snap.rects;else if(this.pref.smartGeometry&&snap.bridgeCount)a.rects=snap.smartRects;if(!comment)a.color=COLORS[this.toolbarState(snap.v,'pdf').color]||COLORS[0];if(JSON.stringify(before.rects)!==JSON.stringify(a.rects)||before.color!==a.color){this.invalidateRedo(a.path);this.undoHistory.push({kind:'update',id:a.id,path:a.path,before});}a.modified=Date.now();}this.save();this.scan();if(comment)this.card(snap.v,a);}

 async verifiedPdfHash(path){const index=getVerifiedIndex(),sizes=new Set(Object.values(index).map(x=>x.size));let size,stamp,read,restat;try{if(/^file:/i.test(path)){const fs=require('fs').promises;let local=path.slice(5);if(/^\/\//.test(local)){const u=new URL(path);if(u.hostname&&u.hostname!=='localhost')return null;local=require('url').fileURLToPath(u);}if(!/^(?:[A-Za-z]:[\\/]|\/[^/])/.test(local)||!(/\.pdf$/i.test(local)))return null;const st=await fs.stat(local);if(!st.isFile())return null;size=st.size;stamp=st.mtimeMs+':'+st.ctimeMs;read=()=>fs.readFile(local);restat=async()=>{const t=await fs.stat(local);return [t.size,t.mtimeMs+':'+t.ctimeMs];};}else{const f=this.app.vault.getAbstractFileByPath(path);if(!f||f.extension?.toLowerCase()!=='pdf'||!f.stat)return null;size=f.stat.size;stamp=f.stat.mtime+':'+f.stat.ctime;read=()=>this.app.vault.readBinary(f);restat=async()=>[f.stat.size,f.stat.mtime+':'+f.stat.ctime];}if(!sizes.has(size))return null;const cached=this.recoveryHashes.get(path);if(cached?.size===size&&cached.stamp===stamp)return cached.hash;const bytes=await read();const now=await restat();if(now[0]!==size||now[1]!==stamp||bytes.byteLength!==size)return null;const hash=recoveryCrypto().createHash('sha256').update(Buffer.from(bytes)).digest('hex');if(this.recoveryAlive){if(this.recoveryHashes.size>=8)this.recoveryHashes.delete(this.recoveryHashes.keys().next().value);this.recoveryHashes.set(path,{size,stamp,hash});}return hash;}catch{return null;}}
 startSymbolRecovery(a,snap){if(!this.recoveryAlive||this.recoveryBusy>=2||a.text.length>16000||Array.from(a.text).filter(c=>badQuoteChar.test(c)).length>64){if(a.normalizationStatus==='unresolved')new Notice(T('Noctilucent：符號未確認，請核對 PDF 原文。'));return;}this.recoveryBusy++;const raw=a.text,geometry=snap.bridgeCount||0;const run=async()=>{let replacements=new Map(),spaces=new Map(),method='none',diagnostic={nativePage:!!snap.native,uniqueText:false};try{const hash=await this.verifiedPdfHash(a.path);if(!this.recoveryAlive)return;const profile=hash&&getVerifiedIndex()[hash];if(profile){replacements=sampleReplacements(raw,profile.pages[String(a.page)]);if(replacements.size)method='verified-sample';spaces=verifiedSpaceReplacements(raw,hash,a.page);for(const offset of replacements.keys())spaces.delete(offset);}else if(!this.isEditingNote()&&snap.native){const result=await readNativeSymbols(snap.native,raw,()=>!this.recoveryAlive||this.isEditingNote());replacements=result.replacements;diagnostic=result.diagnostic;if(replacements.size)method='native-glyph';}if(!this.recoveryAlive||!this.db.items.includes(a)||a.text!==raw||(snap.path!==undefined&&a.path!==snap.path)||!this.pref.symbolRecovery||!this.pref.normalizeNew)return;const classifications=new Map(),preview=normalizeNewQuote(raw,replacements,spaces,classifications);const recoveredSymbols=[],unresolvedSymbols=[],otherControls=[];for(let i=0;i<raw.length;i++){const ch=raw[i];if(!badQuoteChar.test(ch))continue;const code='U+'+ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');const entry={offset:i,raw:code};if(replacements.has(i)){const nativeMatch=diagnostic.nativeMatches?.find(m=>m.offset===i);recoveredSymbols.push({...entry,restored:replacements.get(i),source:method,fontId:nativeMatch?.fontId??null,fontName:null});}else{const status=classifications.get(i);if(status==='unresolved')unresolvedSymbols.push(entry);else otherControls.push({...entry,status,restored:status==='spacing-verified'?' ':undefined});}}this.lastRecoveryDiagnostic={timestamp:new Date().toISOString(),page:a.page,method,recovered:replacements.size,verifiedSpaces:spaces.size,geometryBridges:geometry,verifiedSample:!!profile,...diagnostic,rawText:raw,normalizedText:preview.normalizedText,normalizationStatus:preview.normalizationStatus,recoveredSymbols,unresolvedSymbols,otherControls,geometryBridgeDetails:(snap.bridgeDetails||[]).map(x=>({...x,page:a.page})),nativeOpsAvailable:!!snap.native?.ops,nativeAttempted:!profile&&!!snap.native,fontEvidenceNote:'Verified sample index stores replacement values only; original font names unavailable in this route.'};this.recoveryDiagnosticHistory.push(this.lastRecoveryDiagnostic);if(this.recoveryDiagnosticHistory.length>20)this.recoveryDiagnosticHistory.shift();if(replacements.size||spaces.size){const fields={...preview,symbolRecoveryMethod:method,symbolRecoveryCount:replacements.size};this.recoveryResults.set(a.id,{a,raw,fields});this.applyRecoveryResults();}else if(a.normalizationStatus==='unresolved')new Notice(T('Noctilucent：無法確認符號映射，原始文字與警告已保留。'));}finally{this.recoveryBusy--;}};run().catch(()=>{if(this.recoveryAlive&&a.normalizationStatus==='unresolved')new Notice(T('Noctilucent：符號辨識不可用，請核對 PDF 原文。'));});}
 applyRecoveryResults(){if(!this.recoveryAlive||!this.recoveryResults?.size||this.isEditingNote())return;let changed=false;for(const [id,{a,raw,fields}] of this.recoveryResults){this.recoveryResults.delete(id);if(!this.pref.normalizeNew||!this.pref.symbolRecovery||!this.db.items.includes(a)||a.text!==raw)continue;Object.assign(a,fields);changed=true;if(fields.normalizationStatus==='unresolved')new Notice(T('Noctilucent：部分符號未能確認，請核對 PDF。'));}if(changed){this.save();this.refreshSidebars();}}

 toolbar(v){const d=v.root.ownerDocument;const t=d.createElement('div');t.className='noctilucent-toolbar';Object.assign(t.style,{position:'absolute',top:(this.db.pos?.y??60)+'px',right:this.db.pos?'auto':'12px',left:this.db.pos?this.db.pos.x+'px':'auto'});v.root.append(t);v.toolbar=t;
 // PDF performance: layout size is measured only when the pane or toolbar changes.
 v.toolbarGeometryObserver?.disconnect();
 v.toolbarGeometry={dirty:true,ready:false,posKey:null};
 const Resize=d.defaultView?.ResizeObserver;
 if(Resize){v.toolbarGeometryObserver=new Resize(entries=>{
  const g=v.toolbarGeometry;if(!g)return;
  for(const entry of entries){
   const target=entry.target;
   const width=entry.borderBoxSize?.[0]?.inlineSize??entry.contentRect.width;
   const height=entry.borderBoxSize?.[0]?.blockSize??entry.contentRect.height;
   const kind=target===v.root?'root':'toolbar';
   const name=kind+'Observed';
   if(g[name]!==width+'x'+height){g[name]=width+'x'+height;g.dirty=true;}
  }
 });v.toolbarGeometryObserver.observe(v.root);v.toolbarGeometryObserver.observe(t);}
 const btn=(label,title,fn,parent=t)=>{const b=d.createElement('button');b.textContent=label;b.title=title;b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=fn;parent.append(b);return b;};const grip=btn('⠿',T('拖曳工具列'),()=>{});this.drag(grip,t,v.root,()=>{this.toolbarState(v,'pdf').pos=this.db.pos={x:t.offsetLeft,y:t.offsetTop};this.save();});const layoutToggle=btn('',T('切換為橫向工具列'),()=>this.cycleToolbarDisplay('pdf',v));layoutToggle.className='noctilucent-layout-toggle';layoutToggle.setAttribute('aria-label',T('切換工具列顯示方式'));const group=d.createElement('div');group.className='noctilucent-highlight-group';t.append(group);const m=btn(T('連續：關'),T('切換文字螢光筆的連續模式'),()=>{this.cancelArea();this.cancelSticky();const st=this.toolbarState(v,'pdf');st.continuous=!st.continuous;if(st.continuous){this.eraserTarget=null;this.refreshEraserUI();}v.modeBtn.textContent=T('連續：')+(st.continuous?T('開'):T('關'));},group);v.modeBtn=m;m.textContent=T('連續：')+(this.toolbarState(v,'pdf').continuous?T('開'):T('關'));btn('▰',T('標記選取文字'),()=>{this.cancelArea();this.cancelSticky();if(this.eraserTarget){this.eraserTarget=null;this.refreshEraserUI();}this.add(false,this.snap?.v===v?this.snap:null);},group);const sb=btn('',T('自由批註：點擊 PDF 任意位置（Esc 取消）'),()=>this.toggleSticky(v));setIcon(sb,'sticky-note');sb.classList.add('noctilucent-sticky-tool');v.stickyBtn=sb;sb.setAttribute('aria-pressed',String(this.stickyView===v));const ab=btn('',T('區域高亮：拖曳框選（Esc 取消）'),()=>this.toggleArea(v));setIcon(ab,'scan');ab.classList.add('noctilucent-sticky-tool');v.areaBtn=ab;ab.setAttribute('aria-pressed',String(this.areaView===v));const eraser=btn('⌫',T('橡皮擦：點擊或拖過文字高亮、自由批註圖示及區域高亮（Esc 退出）'),()=>this.toggleEraser('pdf',v.path));setIcon(eraser,'eraser');eraser.classList.add('noctilucent-eraser');v.eraserBtn=eraser;eraser.setAttribute('aria-pressed',String(this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path));const palette=d.createElement('div');palette.className='noctilucent-toolbar-palette';t.append(palette);COLORS.forEach((c,i)=>{const b=btn('●',T('色票 ')+(i+1),()=>{this.toolbarState(v,'pdf').color=this.db.color=i;this.save();this.colorUI(v);},palette);b.style.color=c;b.dataset.color=i;});btn('↶',T('撤回標記'),()=>{if(!this.undoHighlight(v.path))new Notice(T('本次工作階段沒有可撤回的標記'));});btn('↷',T('重做標記'),()=>{if(!this.redoHighlight(v.path))new Notice(T('沒有可重做的標記'));});btn('☰',T('開啟／收起批註側邊欄'),()=>this.toggleSidebar(v.path));this.colorUI(v);this.applyToolbarDisplay(t,'pdf',v);}
 ensureToolbar(v){
  if(!v.toolbar||v.toolbar.parentElement!==v.root){v.toolbar?.remove();this.toolbar(v);}
  const t=v.toolbar;if(t.dataset.dragging==='yes')return;
  const g=v.toolbarGeometry??(v.toolbarGeometry={dirty:true,ready:false,posKey:null});
  const pos=this.toolbarState(v,'pdf').pos;
  const x=Number(pos?.x),y=Number(pos?.y);
  const posKey=pos&&Number.isFinite(x)&&Number.isFinite(y)?x+'|'+y:'default';
  // No layout reads on the ordinary 350ms scan path. A ResizeObserver detects
  // actual dimensions changing, including translation/font/sidebar changes.
  if(g.ready&&!g.dirty&&g.posKey===posKey&&v.toolbarGeometryObserver)return;
  const w=v.root.clientWidth,h=v.root.clientHeight;
  const tw=t.offsetWidth,th=t.offsetHeight;
  if(!w||!h||!tw||!th){g.ready=false;return;}
  const clamp=(n,max)=>Math.max(0,Math.min(n,Math.max(0,max)));
  if(posKey!=='default'){
   const left=clamp(x,w-tw)+'px',top=clamp(y,h-th)+'px';
   if(t.style.right!=='auto')t.style.right='auto';
   if(t.style.left!==left)t.style.left=left;
   if(t.style.top!==top)t.style.top=top;
  }else{
   const top=clamp(60,h-th)+'px';
   if(t.style.left!=='auto')t.style.left='auto';
   if(t.style.right!=='12px')t.style.right='12px';
   if(t.style.top!==top)t.style.top=top;
  }
  g.ready=true;g.dirty=false;g.posKey=posKey;
 }

 colorUI(v){for(const b of v.toolbar.querySelectorAll('[data-color]'))b.style.outline=+b.dataset.color===this.toolbarState(v,'pdf').color?'2px solid var(--text-normal)':'none';}
 render(v,p){const l=this.pageLayer(v,p);const pageRotation=this.rotation(p);const revision=this.renderRev+'|'+v.path+'|'+p.dataset.pageNumber+'|'+pageRotation;if(l.dataset.revision===revision)return;l.dataset.revision=revision;const items=this.db.items.filter(a=>a.path===v.path&&a.page===+p.dataset.pageNumber&&(special(a)||a.rotation===pageRotation));if(this.areaGesture?.layer===l||l.querySelector('.noctilucent-sticky-marker.is-dragging')){delete l.dataset.revision;return;}const key=JSON.stringify(items.map(a=>[a.id,a.color,!!a.note,a.rects,a.anchor,a.rotation,special(a)?pageRotation:null,a.areaStyle,a.opacity,v.areaEditId===a.id]));if(l.dataset.key===key)return;l.dataset.key=key;l.replaceChildren();for(const a of items){if(area(a)){this.renderArea(v,p,l,a);continue;}if(sticky(a)){this.renderSticky(v,p,l,a);continue;}for(const r of a.rects){const h=p.ownerDocument.createElement('div');Object.assign(h.style,{position:'absolute',left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%',background:a.color,opacity:'0.4',pointerEvents:'none'});l.append(h);}const r=a.rects.at(-1);const b=p.ownerDocument.createElement('button');b.className='noctilucent-marker';b.dataset.annotationId=a.id;b.textContent=a.note?'▣':'+';b.title='';b.setAttribute('aria-label',a.note?T('開啟批註'):T('新增批註／修改顏色'));Object.assign(b.style,{position:'absolute',left:Math.min(99,(r.x+r.w)*100)+'%',top:r.y*100+'%',transform:'translate(-90%,-85%)',width:'12px',height:'12px',padding:'0',fontSize:'9px',lineHeight:'10px',border:'1px solid #888',borderRadius:'3px',background:a.color,color:'#222',pointerEvents:'auto',cursor:'pointer'});b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=()=>{if(this.eraserTarget?.kind==='pdf'&&this.eraserTarget.path===v.path)return;this.hidePreview(v);this.card(v,a);};b.addEventListener('pointerenter',()=>{if(!a.note||this.eraserTarget?.kind==='pdf')return;clearTimeout(v.hoverTimer);v.hoverTimer=setTimeout(()=>this.preview(v,a),350);});b.addEventListener('pointerleave',()=>{clearTimeout(v.hoverTimer);this.hidePreview(v);});l.append(b);}}
 rootRect(v,el){let b=el.getBoundingClientRect(),x=b.left,y=b.top,w=b.width,h=b.height;let win=el.ownerDocument.defaultView;while(win&&win!==v.root.ownerDocument.defaultView){const f=win.frameElement;if(!f)break;const r=f.getBoundingClientRect();const sx=r.width/(f.offsetWidth||r.width||1),sy=r.height/(f.offsetHeight||r.height||1);x=r.left+(f.clientLeft+x)*sx;y=r.top+(f.clientTop+y)*sy;w*=sx;h*=sy;win=f.ownerDocument.defaultView;}return {left:x,top:y,right:x+w,bottom:y+h,width:w,height:h};}
 marker(v,a){const id=a.id,esc=typeof id==='string'?globalThis.CSS?.escape:null;for(const [p,l] of v.layers)if(+p.dataset.pageNumber===a.page&&l.isConnected){const el=esc?l.querySelector('.noctilucent-marker[data-annotation-id="'+esc.call(globalThis.CSS,id)+'"]'):[...l.querySelectorAll('.noctilucent-marker')].find(n=>n.dataset.annotationId===id);if(el)return el;}}
 ensureOverlay(v){if(v.overlay?.isConnected)return v.overlay;const d=v.root.ownerDocument;const host=d.createElement('div');host.className='noctilucent-overlay';d.body.append(host);v.overlay=host;this.syncOverlay(v);const win=d.defaultView;v.overlayResize=()=>this.syncOverlay(v);win?.addEventListener('resize',v.overlayResize);if(win?.ResizeObserver){v.overlayObserver=new win.ResizeObserver(v.overlayResize);v.overlayObserver.observe(v.root);}return host;}
 syncOverlay(v){const host=v.overlay;if(!host)return;const r=v.root.getBoundingClientRect();const visible=v.root.isConnected&&r.width>0&&r.height>0&&v.root.getClientRects().length>0;const set=(k,val)=>{if(host.style[k]!==val)host.style[k]=val;};set('display',visible?'block':'none');if(!visible)return;set('left',r.left+'px');set('top',r.top+'px');set('width',r.width+'px');set('height',r.height+'px');}
 positionCard(v,a,c,sharedObstacles=null){if(c.dataset.dragged==='yes')return;const el=this.marker(v,a);if(!el)return;const root=v.root.getBoundingClientRect(),r=this.rootRect(v,el),w=c.offsetWidth,h=c.offsetHeight;const clamp=(n,max)=>Math.max(0,Math.min(n,Math.max(0,max)));const x=r.right-root.left,y=r.bottom-root.top; if(r.bottom<root.top||r.top>root.bottom||r.right<root.left||r.left>root.right){c.style.visibility='hidden';return;}c.style.visibility='visible';const candidates=[[x+8,y+5],[x-w-8,y+5],[x-w,y-h-18],[x,y-h-18]];const tool=v.toolbar?.getBoundingClientRect();const obstacles=[tool,...(sharedObstacles??v.root.ownerDocument.querySelectorAll('.vittra-tooltip'))].map(t=>t?.getBoundingClientRect?t.getBoundingClientRect():t).filter(t=>t&&t.width&&t.height);let best=null;for(const [cx,cy] of candidates){const xx=clamp(cx,root.width-w),yy=clamp(cy,root.height-h);const abs={left:root.left+xx,top:root.top+yy,right:root.left+xx+w,bottom:root.top+yy+h};let score=Math.abs(cx-xx)+Math.abs(cy-yy);for(const t of [...obstacles,r])score+=Math.max(0,Math.min(abs.right,t.right)-Math.max(abs.left,t.left))*Math.max(0,Math.min(abs.bottom,t.bottom)-Math.max(abs.top,t.top));if(!best||score<best.score)best={xx,yy,score};}const left=best.xx+'px',top=best.yy+'px';if(c.style.left!==left)c.style.left=left;if(c.style.top!==top)c.style.top=top;}
 hidePreview(v){v.preview?.remove();v.preview=null;}
 preview(v,a){if(v.cards.has(a.id)||!a.note||!this.marker(v,a))return;this.hidePreview(v);const c=v.root.ownerDocument.createElement('div');c.className='noctilucent-card noctilucent-preview';c.textContent=a.note;this.ensureOverlay(v).append(c);v.preview=c;v.previewId=a.id;this.positionCard(v,a,c);}
 card(v,a){if(v.cards.has(a.id)){v.cards.get(a.id).querySelector('textarea').focus();return;}const d=v.root.ownerDocument,c=d.createElement('div');c.className='noctilucent-card';const root=v.root.getBoundingClientRect();Object.assign(c.style,{left:Math.max(0,root.width-350)+'px',top:'100px'});const host=this.ensureOverlay(v);host.append(c);v.cards.set(a.id,c);this.hidePreview(v);const head=d.createElement('div');head.className='noctilucent-head';head.textContent=(area(a)?T('⠿ 區域批註 · p. '):sticky(a)?T('⠿ 自由批註 · p. '):T('⠿ 批註 · p. '))+a.page;c.append(head);const close=d.createElement('button');close.textContent='×';head.append(close);close.onclick=()=>{this.flushSave();this.releaseEditors(c);c.remove();v.cards.delete(a.id);};this.drag(head,c,host,()=>{c.dataset.dragged="yes";});const ta=d.createElement('textarea');ta.placeholder=T('輸入批註（自動儲存）');ta.value=a.note;c.append(ta);const footer=d.createElement('div');c.append(footer);const saveControls=this.bindEditor(ta,a,footer,()=>{if(v.cards.get(a.id)!==c)return;this.releaseEditors(c);c.remove();v.cards.delete(a.id);this.syncNoteUI();});const copy=d.createElement('button');copy.textContent=area(a)?T('複製圖片＋批註'):T('複製原文＋批註');copy.onclick=()=>area(a)?this.copyAreaWithNote(a.id):navigator.clipboard.writeText(special(a)?a.note:quoteText(a)+'\n\n'+a.note).catch(()=>new Notice(T('複製失敗')));footer.append(copy);const del=d.createElement('button');del.textContent=T('刪除標記');del.onclick=()=>{if(special(a)){this.deleteFromSidebar(a.id);return;}if(!window.confirm(T('刪除這個高亮與批註？')))return;this.db.items=this.db.items.filter(x=>x.id!==a.id);this.undoHistory=this.undoHistory.filter(h=>h.id!==a.id);this.invalidateRedo(a.path);this.save();close.click();this.scan();};footer.append(del);const palette=d.createElement('div');palette.className='noctilucent-card-colors';for(const color of COLORS){const btn=d.createElement('button');btn.textContent='●';btn.style.color=color;btn.title=T('更改標記顏色');btn.setAttribute('aria-label',T('更改高亮顏色 ')+color);btn.onclick=()=>{if(special(a)){this.colorFromSidebar(a.id,color);return;}if(a.color!==color)this.invalidateRedo(a.path);a.color=color;a.modified=Date.now();this.save();this.scan();};palette.append(btn);}c.insertBefore(palette,ta);if(area(a))this.areaControls(v,a,c,ta);this.positionCard(v,a,c); }


 // A single reading target across all formats. Sidebar focus is not a document switch.
 sidebarDocumentPath(leaf){const view=leaf?.view,path=view?.file?.path||view?.getState?.()?.file;if(typeof path!=='string'||!this.pathEnabled(path))return null;if(view.getViewType?.()==='pdf'&&/\.pdf$/i.test(path))return path;const epub=this.epubAdapter?.candidate(leaf);if(epub)return epub.path;return this.mdReadingLeaf(leaf)?.path||null;}
 sidebarPath(active=this.app.workspace.activeLeaf){const ws=this.app.workspace,view=active?.view,path=view?.file?.path||view?.getState?.()?.file;const current=this.sidebarDocumentPath(active);if(current){this.lastSidebarDocumentPath=current;return current;}
  // An actual unsupported/disabled document must not fall back to an unrelated book.
  if(typeof path==='string'&&/\.(pdf|epub|md|docx|pptx)$/i.test(path)){this.lastSidebarDocumentPath=null;return null;}
  // Side panels (including the annotation sidebar) retain the most recent reading target.
  // Hidden tabs need not have a visible DOM, so validate their identity, not their geometry.
  const remembered=this.lastSidebarDocumentPath;if(!remembered||!this.pathEnabled(remembered))return null;let found=false;ws.iterateAllLeaves(leaf=>{const v=leaf?.view,p=v?.file?.path||v?.getState?.()?.file;if(p!==remembered)return;const type=v.getViewType?.();if(/\.pdf$/i.test(p)?type==='pdf':/\.epub$/i.test(p)?type==='epub':/\.md$/i.test(p)?type==='markdown'&&v.getMode?.()==='preview':/\.(docx|pptx)$/i.test(p)&&type!=='markdown')found=true;});if(!found){this.lastSidebarDocumentPath=null;return null;}return remembered;}
 refreshSidebars(){if(this.isEditingNote())return;for(const l of this.app.workspace.getLeavesOfType(SIDEBAR))l.view.refresh?.();}
 async toggleSidebar(path){const ws=this.app.workspace;const leaf=ws.getLeavesOfType(SIDEBAR)[0];const el=leaf?.view?.containerEl;const dock=ws.rightSplit;const visible=el?.isConnected&&el.getClientRects().length>0&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&el.ownerDocument.defaultView.getComputedStyle(el).visibility!=='hidden';if(visible&&dock?.collapsed!==true){if(typeof dock?.collapse==='function'&&dock.containerEl?.contains(el)){dock.collapse();}else{leaf.detach();}return;}await this.openSidebar(path);}
 async openSidebar(path){if(path&&this.pathEnabled(path))this.lastSidebarDocumentPath=path;else this.sidebarPath();const ws=this.app.workspace;let leaf=ws.getLeavesOfType(SIDEBAR)[0];if(!leaf){leaf=ws.getRightLeaf(false);if(!leaf){new Notice(T('無法開啟批註側邊欄'));return;}await leaf.setViewState({type:SIDEBAR,active:true});}await ws.revealLeaf(leaf);leaf.view.refresh?.(true);}
 toggleAnnotationPin(id){
  const a=this.db.items.find(x=>x.id===id);if(!a||!this.pathEnabled(a.path))return;
  if(a.pinnedAt){delete a.pinnedAt;}else{
   const existing=this.db.items.filter(x=>x.path===a.path&&Number(x.pinnedAt)>0);
   if(existing.length>=3){new Notice(T('Noctilucent：每份文件最多釘選三筆，請先取消一筆。'));return;}
   a.pinnedAt=Date.now()+existing.length/1000;
  }
  a.modified=Date.now();this.save();this.refreshSidebars();
 }
 // The bulk command never uses the sidebar's search, color filter, or sort.
 // Back up the ENTIRE current data snapshot in a separate file before mutation.
 async deleteAllForDocument(path){
  if(!path||!this.pathEnabled(path))return;
  const selected=this.db.items.map((a,index)=>({a,index})).filter(x=>x.a.path===path);
  if(!selected.length){new Notice(T('目前文件沒有可刪除的標記'));return;}
  const name=path.split('/').at(-1);
  if(!window.confirm(`${T('確定刪除「')}${name}${T('」的全部 ')}${selected.length}${T(' 筆高亮與批註？\n\n不會刪除原始文件。刪除前將另存完整 data.json 備份，並可於本次工作階段 Ctrl+Z 整批撤回。')}`))return;
  const ok=await this.flushSave();if(ok!==true){new Notice(T('儲存尚未成功，已取消全部刪除'));return;}
  const folder=normalizePath((this.manifest.dir||this.app.vault.configDir+'/plugins/'+this.manifest.id)+'/backups');
  const adapter=this.app.vault.adapter;
  let backup='';
  try{
   if(!await adapter.exists(folder))await adapter.mkdir(folder);
   const stamp=new Date().toISOString().replace(/[:.]/g,'-');
   backup=normalizePath(folder+'/before-delete-'+stamp+'-'+Math.random().toString(36).slice(2,7)+'.json');
   await adapter.write(backup,JSON.stringify(clone(this.db),null,2));
   if(!await adapter.exists(backup))throw Error(T('無法確認備份檔存在'));
  }catch(e){console.error('Noctilucent bulk backup failed',e);new Notice(T('備份失敗：未刪除任何標記。')+(e.message||''));return;}
  const before=selected.map(x=>({index:x.index,item:clone(x.a)}));
  const ids=new Set(before.map(x=>x.item.id));
  const previousHistory={undo:this.undoHistory.slice(),redo:this.redoHistory.slice()};
  this.db.items=this.db.items.filter(a=>!ids.has(a.id));
  this.undoHistory=this.undoHistory.filter(h=>h.path!==path);
  this.redoHistory=this.redoHistory.filter(h=>h.path!==path);
  this.undoHistory.push({kind:'batch-delete',id:'batch-'+Date.now(),path,items:before,backup});
  this.closeDocumentAnnotationCards(path,ids);
  this.rev++;this.renderRev++;this.sideRev++;
  const committed=await this.flushSave();
  if(committed!==true){
   // Failed save: do not leave the in-memory view appearing deleted.
   for(const {index,item} of before)this.db.items.splice(Math.min(index,this.db.items.length),0,item);
   this.undoHistory=previousHistory.undo;this.redoHistory=previousHistory.redo;
   this.saveError=true;this.renderRev++;this.sideRev++;
   this.scan();this.mdRefresh();this.refreshSidebars();
   new Notice(T('刪除儲存失敗：已恢復記憶體中的標記；保留備份 ')+backup);
   return;
  }
  this.scan();this.mdRefresh();this.refreshSidebars();
  new Notice(`${T('已刪除 ')}${before.length}${T(' 筆。完整備份：')}${backup}${T('（可 Ctrl+Z 撤回）')}`,10000);
 }
 closeDocumentAnnotationCards(path,ids=null){
  for(const v of this.epubAdapter?.views.values()||[])if(v.path===path)for(const [id] of v.cards)if(!ids||ids.has(id))this.mdRemoveCard(v,id);
  for(const v of this.views.values())if(v.path===path){
   for(const [id,card] of [...v.cards])if(!ids||ids.has(id)){this.releaseEditors(card);card.remove();v.cards.delete(id);}
   this.hidePreview(v);
  }
  for(const v of this.mdViews.values())if(v.path===path){
   for(const [id] of [...(v.cards||new Map())])if(!ids||ids.has(id))this.mdRemoveCard(v,id);
   this.mdHideMarkerPreview(v);
  }
 }
 async openBulkCards(path){
  if(!this.pathEnabled(path))return new Set();
  const notes=this.db.items.filter(a=>a.path===path&&String(a.note||'').trim());
  if(!notes.length)return new Set();
  if(notes.length>12&&!window.confirm(`${T('目前文件有 ')}${notes.length}${T(' 則文字批註，同時展開可能使畫面擁擠或影響效能。確定全部展開？')}`))return new Set();
  const opened=new Set();let omitted=0,processed=0;
  for(const a of notes){
   if(!this.db.items.includes(a))continue;
   if(epubType(a)){const v=[...this.epubAdapter?.views.values()||[]].find(v=>v.path===path);const s=v&&[...v.frames.values()].find(s=>s.ranges.has(a.id));if(!s){omitted++;continue;}if(v.cards.has(a.id))continue;this.epubAdapter.card(s,a,false);opened.add(a.id);
   }else if(['office-highlight','markdown-highlight'].includes(a.type)){
    const v=[...this.mdViews.values()].find(v=>v.path===path&&this.mdReadingLeaf(v.leaf));
    if(!v){omitted++;continue;}
    const range=this.mdFindRange(v,a);
    if(!range){omitted++;continue;}
    if(v.cards?.has(a.id))continue;
    this.mdCard(v,a,range,false);opened.add(a.id);
   }else{
    const v=[...this.views.values()].find(v=>v.path===path);
    if(!v||!this.marker(v,a)){omitted++;continue;}
    if(v.cards.has(a.id))continue;
    this.card(v,a);opened.add(a.id);
   }
   // Yield between small batches rather than constructing dozens of windows in one frame.
   if(++processed%6===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(omitted)new Notice(`${T('已展開 ')}${opened.size}${T(' 則；另有 ')}${omitted}${T(' 則尚未載入或無法安全定位，未強制開啟。')}`);
  else new Notice(`${T('已展開 ')}${opened.size}${T(' 則批註視窗')}`);
  return opened;
 }
 closeBulkCards(path,ids){
  for(const v of this.epubAdapter?.views.values()||[])if(v.path===path)for(const id of ids)this.mdRemoveCard(v,id);
  for(const v of this.views.values())if(v.path===path)for(const id of ids){
   const card=v.cards.get(id);if(!card)continue;this.releaseEditors(card);card.remove();v.cards.delete(id);
  }
  for(const v of this.mdViews.values())if(v.path===path)for(const id of ids)this.mdRemoveCard(v,id);
  this.flushSave();
 }
 // v0.1.8 export is read-only with respect to annotation data and source documents.
 safeExportName(raw){
  return String(raw||'').replace(/\.md$/i,'').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,' ').replace(/[. ]+$/g,'').trim().slice(0,115);
 }
 defaultExportName(path){
  const leaf=String(path||'').split('/').pop()||'Untitled';
  return this.safeExportName(leaf.replace(/\.[^.]+$/,'')+' - Highlights');
 }
 openExportDialog(path,layout,group){
  if(!path||!this.pathEnabled(path)||!this.db.items.some(a=>a.path===path)){new Notice(T('目前文件沒有可匯出的標記'));return;}
  const pref=this.documentViewPref(path);new NoctilucentExportModal(this.app,this,path,layout??pref.layout,group??pref.group).open();
 }
 exportLocation(a){
  const ext=String(a.path||'').split('.').at(-1).toLowerCase();
  if(ext==='epub')return epubChapterLabel(a);
  if(ext==='pptx'){
   const slide=Number(a.mdAnchor?.slideNumber);
   return Number.isSafeInteger(slide)&&slide>0?'Slide '+slide:T('投影片編號未確認');
  }
  if(ext==='pdf')return Number.isSafeInteger(Number(a.page))&&Number(a.page)>0?'Page '+Number(a.page):T('PDF 頁碼未確認');
  if(ext==='docx')return T('Word 文件（文字錨點）');
  return T('Markdown 閱讀模式（文字錨點）');
 }
 localizedExportLocation(a){const raw=this.exportLocation(a);if(noctilucentLocale==='zh-TW'){if(/^Page \d+$/.test(raw))return '第 '+raw.slice(5)+' 頁';if(/^Slide \d+$/.test(raw))return '投影片 '+raw.slice(6);}return raw;}
 exportSort(items,path){
  const ext=String(path).split('.').at(-1).toLowerCase();
  const numeric=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?Number(n):Number.MAX_SAFE_INTEGER;
  const key=a=>{
   if(ext==='pdf')return [Number(a.page)>0?Number(a.page):Number.MAX_SAFE_INTEGER,numeric(point(a)?.y),numeric(point(a)?.x),numeric(a.created)];
   if(ext==='epub')return [numeric(a.epubAnchor?.chapter),numeric(a.epubAnchor?.start),numeric(a.epubAnchor?.image),numeric(a.created)];
   if(ext==='pptx')return [Number(a.mdAnchor?.slideNumber)>0?Number(a.mdAnchor.slideNumber):Number.MAX_SAFE_INTEGER,numeric(a.mdAnchor?.block),numeric(a.mdAnchor?.start),numeric(a.created)];
   return [numeric(ext==='md'&&a.mdAnchor?.code?a.mdAnchor.codeOrder??a.mdAnchor.block:a.mdAnchor?.block),numeric(a.mdAnchor?.start),numeric(a.created),0];
  };
  return [...items].sort((a,b)=>{const x=key(a),y=key(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return x[i]-y[i];}return String(a.id).localeCompare(String(b.id));});
 }
 // Quote every line so pasted research text cannot accidentally become document headings/frontmatter.
 exportQuote(value){return String(value??'').replace(/\r\n?/g,'\n').split('\n').map(line=>'> '+line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join('\n');}
 renderAnnotationsMarkdown(path,items,destination,layout,group){
  const f=this.exportFields(),pref=this.documentViewPref(path);layout=safeLayout(layout??pref.layout);group=safeGroup(group??pref.group);
  const plain=layout==='plain',entries=this.exportSort(items,path),source=this.app.vault.getAbstractFileByPath(path),ext=path.split('.').at(-1).toLowerCase();
  const esc=v=>String(v??'').replace(/[\r\n]+/g,' ').replace(/[\\`*_{}\[\]<>|#]/g,'\\$&');
  const literal=v=>String(v??'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}\[\]#|]/g,'\\$&').replace(/^(\s*)([-+])(?=\s|$)/,'$1\\$2').replace(/^(\s*)(\d+)([.)])(?=\s)/,'$1$2\\$3')).join('\n');
  const note=v=>String(v??'').replace(/\r\n?/g,'\n').replace(/</g,'&lt;');
  const loc=a=>this.localizedExportLocation(a);
  const link=a=>{if(!source)return '';const sub=a&&f.location&&ext==='pdf'&&Number.isSafeInteger(Number(a.page))&&Number(a.page)>0?'#page='+Number(a.page):undefined;try{return this.app.fileManager.generateMarkdownLink(source,destination,sub,a?T('開啟原始文件'):path.split('/').at(-1));}catch{return '';}};
  const title=esc(path.split('/').at(-1).replace(/\.[^.]+$/,''));
  const lines=[...(plain?[]:['NOCTILUCENT · '+exportLayoutName(layout),'']), '# ✦ '+title,''];
  if(f.source)lines.push(T('**來源：** ')+(link(null)||esc(path)),'');
  const counts=COLORS.map((_,i)=>entries.filter(a=>exportColorIndex(a)===i).length),total=counts.reduce((a,b)=>a+b,0);
  // All numeric style attributes are generated from counts, never user text.
  const html=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const spectrum=(values,caption)=>{const sum=values.reduce((a,b)=>a+b,0);return '<div class="noctilucent-export-spectrum" role="img" aria-label="'+html(caption)+'">'+(sum?values.map((n,i)=>n?'<span class="noctilucent-export-segment noc-color-'+i+'" style="flex-grow:'+n+'" title="'+html(T(EXPORT_COLOR_NAMES[i])+': '+n)+'">'+n+' '+html(T(EXPORT_COLOR_NAMES[i]))+'</span>':'').join(''):'<span class="noctilucent-export-empty">0</span>')+'</div>';};
  const statsLabel=counts.map((n,i)=>T(EXPORT_COLOR_NAMES[i])+': '+n).join('; ');
  if(plain)lines.push('---','');else lines.push(spectrum(counts,statsLabel),'');
  const chartRow=(label,n,max,color)=>'<div class="noctilucent-export-chart-row"><span>'+html(label)+' · '+n+'</span><div class="noctilucent-export-spectrum"><span class="noctilucent-export-segment noc-color-'+color+'" style="flex-grow:'+n+'">'+n+'</span>'+(max>n?'<span class="noctilucent-export-segment noc-color-empty" style="flex-grow:'+(max-n)+'">'+(max-n)+'</span>':'')+'</div></div>';
  if(layout==='report'){
   const metrics=[[T('標記總數'),entries.length],...(f.note?[[T('有文字批註'),entries.filter(a=>String(a.note||'').trim()).length]]:[]),...(f.pin?[[T('已釘選'),entries.filter(a=>a.pinnedAt).length]]:[])];
   lines.push('## '+T('閱讀統計'),'','<div class="noctilucent-export-metrics">'+metrics.map(([label,n])=>'<div class="noctilucent-export-metric"><span>'+html(label)+'</span><strong>'+n+'</strong></div>').join('')+'</div>','');
   lines.push('','### '+T('色彩分布'),'');
   for(let i=0;i<COLORS.length;i++)if(counts[i])lines.push(chartRow(T(EXPORT_COLOR_NAMES[i])+' ('+(counts[i]/total*100).toFixed(1)+'%)',counts[i],Math.max(...counts),i),'');
   if(!total)lines.push(T('無彩色標記'));
   if(f.location){const distribution=new Map();for(const a of entries){const key=loc(a);distribution.set(key,(distribution.get(key)||0)+1);}lines.push('','### '+T('位置分布'),'');const max=Math.max(1,...distribution.values());for(const [key,n] of distribution)lines.push(chartRow(key,n,max,7),'');}
   lines.push('');
  }
  const groups=[];
  const collect=(key,name,entry,color=-1)=>{let g=groups.find(x=>x.key===key);if(!g){g={key,name,items:[],color};groups.push(g);}g.items.push(entry);};
  if(group==='color'){
   for(const i of [0,1,2,3,4,5,6,7,-1])for(const a of entries)if(exportColorIndex(a)===i)collect('color'+i,T(EXPORT_COLOR_NAMES[i]||'其他顏色'),a,i);
  }else{
   if(f.pin)for(const a of entries.filter(a=>a.pinnedAt).sort((a,b)=>Number(a.pinnedAt)-Number(b.pinnedAt)))collect('pinned',T('釘選'),a);
   for(const a of entries)if(!f.pin||!a.pinnedAt){const name=f.location?loc(a):T('批註');collect('loc:'+name,name,a);}
  }
  const callout=(kind,meta,heading,body)=>['> [!'+kind+(meta?'|'+meta:'')+'] '+heading,'>',...body.map(x=>String(x).split('\n').map(y=>'> '+y).join('\n'))].join('\n');
  const type=a=>area(a)?T('區域高亮'):sticky(a)?T('自由批註'):T('文字高亮');
  const meta=a=>{
   const m=[];if(f.color&&layout!=='matrix')m.push(exportColorName(a));if(f.location&&layout!=='matrix')m.push(loc(a));if(f.type&&plain)m.push(type(a));if(f.pin&&a.pinnedAt)m.push('📌 '+T('釘選'));
   if(f.source)m.push(link(a)||T('- 返回來源：未能產生可用連結').replace(/^- /,''));
   if(f.id&&typeof a.id==='string')m.push('ID: `'+a.id.replace(/[`\r\n]/g,'')+'`');
   if(f.created&&Number.isFinite(a.created))m.push(T('- 建立時間：').replace(/^- /,'')+new Date(a.created).toISOString());
   if(f.modified&&Number.isFinite(a.modified))m.push(T('- 修改時間：').replace(/^- /,'')+new Date(a.modified).toISOString());return m.join(' · ');
  };
  const original=a=>{if(!f.quote)return '';if(special(a))return f.type?(area(a)?T('區域高亮'):T('自由批註')):'';return literal(quoteText(a)||T('（原文未記錄）'))+(a.normalizationStatus==='unresolved'?'\n\n'+T('⚠ PDF 原文可能含未辨識的字元，引用前請核對。'):'');};
  const comment=a=>f.note?note(a.note||''):'';
  for(const g of groups){
   lines.push('## '+esc(g.name),'');if(layout==='sections')lines.push('---','');
   for(const a of g.items){
    const c=exportColorIndex(a),metadata=meta(a),q=original(a),n=comment(a),color=c<0?'other':String(c),heading=(f.type?type(a):T('批註'));
    if(plain){if(metadata)lines.push(metadata,'');if(q)lines.push(this.exportQuote(special(a)?q:quoteText(a)||T('（原文未記錄）')),'');if(a.normalizationStatus==='unresolved'&&f.quote&&!special(a))lines.push(T('⚠ PDF 原文可能含未辨識的字元，引用前請核對。'),'');if(n)lines.push('**'+T('我的批註')+'**','',n,'');lines.push('---','');continue;}
    const body=[];if(metadata)body.push(metadata,'');
    if(['parallel','minimal','matrix'].includes(layout)){
     const cells=[];
     if(layout==='matrix'){
      if(f.location)cells.push(callout('noc-export-cell','location',''+T('位置'),[esc(loc(a))]));
      if(f.color)cells.push(callout('noc-export-cell','color',''+T('色票'),[exportColorName(a)]));
     }
     if(f.quote)cells.push(callout('noc-export-cell','quote',T('原文'),[q||'—']));
     if(f.note)cells.push(callout('noc-export-cell','note',T('我的批註'),[n||'—']));
     if(cells.length)body.push(cells.join('\n\n'));
    }else{if(q)body.push(q,'');if(n)body.push('**'+T('我的批註')+'**','',n);}
    lines.push(callout('noc-export-'+layout,color,heading,body),'');
   }
  }
  return lines.join('\n').trimEnd()+'\n';
 }
 async exportAnnotationsMarkdown(path,requestedName,layout,group){
  // Snapshot is taken only after a confirmed flush; never modify this.db while exporting.
  if(!path){new Notice(T('請先選擇文件'));return null;}if(!this.pathEnabled(path)){new Notice(T('目前文件的批註功能已停用'));return null;}
  try{
   const result=await this.flushSave();
   if(result!==true||this.saveError||this.savedRev!==this.rev){new Notice(T('尚有資料未成功儲存，已取消匯出以避免漏掉批註'));return null;}
   const items=clone(this.db.items.filter(a=>a.path===path));
   if(!items.length){new Notice(T('目前文件沒有可匯出的標記'));return null;}
   const base=this.safeExportName(requestedName||this.defaultExportName(path));
   if(!base)throw Error(T('無效的匯出檔名'));
   const folder=this.exportFolder();const vault=this.app.vault;
   // Preflight the export path before making any filesystem changes.
   if(folder!=='/'&&vault.getAbstractFileByPath(folder)&&!vault.getAbstractFileByPath(folder)?.children)throw Error(T('匯出資料夾名稱已被檔案佔用'));
   let target=normalizePath((folder==='/'?'':folder+'/')+base+'.md'),version=2;
   while(vault.getAbstractFileByPath(target)){
    target=normalizePath((folder==='/'?'':folder+'/')+base+' ('+version++ +').md');
    if(version>10000)throw Error(T('匯出檔案同名過多'));
   }
   const output=this.renderAnnotationsMarkdown(path,items,target,layout,group);
   if(folder!=='/'){let parent='';for(const part of folder.split('/')){parent=parent?parent+'/'+part:part;const existing=vault.getAbstractFileByPath(parent);if(existing&&!existing.children)throw Error(T('匯出資料夾名稱已被檔案佔用'));if(!existing)await vault.createFolder(parent);}}
   // create() fails if another writer took the same name; it never overwrites existing files.
   const file=await vault.create(target,output);
   new Notice(T('Noctilucent：已匯出 ')+items.length+T(' 筆標記至 ')+target);
   try{const leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file);await this.app.workspace.revealLeaf(leaf);}catch(e){console.warn('Noctilucent export: created file but could not open it',e);}
   return file;
  }catch(e){console.error('Noctilucent Markdown export failed',e);new Notice(T('Noctilucent：匯出失敗：')+(e?.message||String(e)));return null;}
 }

 async copyAnnotations(items){if(!items.length){new Notice(T('沒有可複製的批註'));return;}const ordered=[...items].sort((a,b)=>a.page-b.page||(point(a)?.y||0)-(point(b)?.y||0));const text=ordered.map(a=>`[${a.type==='markdown-highlight'?'Markdown':a.type==='office-highlight'?'Office':epubType(a)?epubChapterLabel(a):'p. '+a.page}] ${epubType(a)&&special(a)?T(area(a)?'區域高亮':'自由批註'):quoteText(a)}${a.note?'\n'+a.note:''}`).join('\n\n');try{await navigator.clipboard.writeText(text);new Notice(T('已複製 ')+items.length+T(' 筆批註'));}catch{new Notice(T('複製失敗'));}}
 editFromSidebar(id,note){const a=this.db.items.find(x=>x.id===id);if(!a||!this.pathEnabled(a.path)||a.note===note)return;a.note=note;a.modified=Date.now();for(const v of this.views.values()){const ta=v.cards.get(id)?.querySelector('textarea');if(ta&&ta.value!==note)ta.value=note;if(v.previewId===id)this.hidePreview(v);}this.save();this.scan();this.mdRefresh();}
 colorFromSidebar(id,color){const a=this.db.items.find(x=>x.id===id);if(!a||!this.pathEnabled(a.path)||!COLORS.includes(color)||a.color===color)return;if(special(a)&&!epubType(a))this.recordSticky(a);else{this.invalidateRedo(a.path);if(['office-highlight','markdown-highlight'].includes(a.type)||epubType(a))this.undoHistory.push({kind:'md-color',id:a.id,path:a.path,beforeColor:a.color});}a.color=color;a.modified=Date.now();this.save();this.scan();this.mdRefresh();}
 deleteFromSidebar(id){const a=this.db.items.find(x=>x.id===id);if(!a||!this.pathEnabled(a.path)||!window.confirm(area(a)?T('刪除這則區域批註？'):sticky(a)?T('刪除這則自由批註？'):T('刪除這個高亮與批註？')))return;if(epubType(a)){this.invalidateRedo(a.path);this.undoHistory.push({kind:'erase',id:a.id,path:a.path,item:clone(a),index:this.db.items.indexOf(a)});this.db.items=this.db.items.filter(x=>x.id!==id);this.closeDocumentAnnotationCards(a.path,new Set([id]));this.save();this.scan();this.mdRefresh();return;}if(special(a)){this.invalidateRedo(a.path);this.undoHistory.push({kind:'sticky-delete',id:a.id,path:a.path,item:clone(a),index:this.db.items.indexOf(a)});this.removeStickyItem(a);this.save();this.scan();return;}this.db.items=this.db.items.filter(x=>x.id!==id);this.undoHistory=this.undoHistory.filter(h=>h.id!==id);this.invalidateRedo(a.path);for(const v of this.views.values()){v.cards.get(id)?.remove();v.cards.delete(id);if(v.previewId===id)this.hidePreview(v);}this.save();this.scan();this.mdRefresh();}
 async jumpAnnotation(id){const a=this.db.items.find(x=>x.id===id);if(!a||!this.pathEnabled(a.path))return;if(epubType(a))return this.epubAdapter?.jump(a);if(['markdown-highlight','office-highlight'].includes(a.type))return this.mdJump(a);const ws=this.app.workspace;let leaf=ws.getLeavesOfType('pdf').find(l=>l.view.file?.path===a.path);try{if(!leaf){const f=this.app.vault.getAbstractFileByPath(a.path);if(!f||f.extension!=='pdf'){new Notice(T('找不到原始 PDF'));return;}leaf=ws.getLeaf('tab');await leaf.openFile(f);}ws.setActiveLeaf(leaf,{focus:true});this.lastPdfPath=a.path;await ws.revealLeaf(leaf);for(let i=0;i<12;i++){this.scan();const v=this.views.get(leaf.view.containerEl);const page=v?.sources?.map(s=>s.querySelector('.page[data-page-number="'+Number(a.page)+'"]')).find(Boolean);if(page){if(!i||!page.querySelector('.noctilucent-marker'))page.scrollIntoView({block:'center',inline:'nearest'});const marker=this.marker(v,a);if(marker){marker.scrollIntoView({block:'center',inline:'nearest'});marker.animate?.([{outline:'3px solid var(--interactive-accent)'},{outline:'3px solid transparent'}],{duration:1400});return;} }else if(i===0){const viewer=leaf.view.viewer?.pdfViewer||leaf.view.pdfViewer;try{if(viewer&&'currentPageNumber' in viewer)viewer.currentPageNumber=a.page;else if(typeof leaf.view.setEphemeralState==='function')leaf.view.setEphemeralState({page:a.page});}catch{}}await new Promise(r=>setTimeout(r,150));}new Notice(T('無法精確定位批註；請確認 PDF 頁面已載入及旋轉方向。'));}catch(e){console.error(e);new Notice(T('無法開啟 PDF 批註位置'));}}

 drag(handle,el,root,done){handle.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('button')&&e.target!==handle)return;if(el.classList.contains("noctilucent-card"))el.dataset.dragged="yes";const x=e.clientX,y=e.clientY,l=el.offsetLeft,t=el.offsetTop;handle.setPointerCapture(e.pointerId);el.dataset.dragging='yes';const move=m=>{el.style.right='auto';el.style.left=Math.max(0,Math.min(root.clientWidth-el.offsetWidth,l+m.clientX-x))+'px';el.style.top=Math.max(0,Math.min(root.clientHeight-el.offsetHeight,t+m.clientY-y))+'px';};const end=()=>{delete el.dataset.dragging;handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);done?.();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);});}
 dispose(v){if(this.areaView===v||this.areaGesture?.v===v)this.cancelArea();if(this.stickyView===v)this.cancelSticky();this.flushSave();clearTimeout(v.hoverTimer);this.hidePreview(v);v.toolbar?.remove();for(const l of v.layers.values())l.remove();for(const c of v.cards.values()){this.releaseEditors(c);c.remove();}v.overlayObserver?.disconnect();v.toolbarGeometryObserver?.disconnect();v.toolbarGeometryObserver=null;v.toolbarGeometry=null;v.root.ownerDocument.defaultView?.removeEventListener('resize',v.overlayResize);v.overlay?.remove();if(this.snap?.v===v)this.snap=null;}
 onunload(){this.epubAdapter?.stop();if(this.mdRefreshFrame!=null){(this.app.workspace.containerEl?.ownerDocument?.defaultView||window).cancelAnimationFrame(this.mdRefreshFrame);this.mdRefreshFrame=null;}for(const d of this.mdHighlightDocs||[])for(let i=0;i<COLORS.length;i++)d.defaultView?.CSS?.highlights?.delete('noctilucent-md-'+i);for(const v of this.mdViews?.values()||[]){v.observer?.disconnect();this.mdClearCommentAction(v);this.mdCloseAllCards(v);v.bar?.remove();v.root.classList.remove('noctilucent-md-floating-host');}this.mdViews?.clear();this.eraserGesture?.cleanup?.();this.eraserTarget=null;this.eraserGesture=null;this.recoveryAlive=false;this.recoveryResults.clear();this.recoveryHashes.clear();this.cancelArea();this.cancelSticky();clearTimeout(this.noteRefreshTimer);this.flushSave();this.app.workspace.detachLeavesOfType(SIDEBAR);for(const v of this.views.values())this.dispose(v);for(const [d,fn] of this.docs){d.removeEventListener('mouseup',fn);if(this.eraseDocuments?.has(d)){const e=this.eraseDocuments.get(d);d.removeEventListener('pointerdown',e.down,true);d.removeEventListener('click',e.click,true);this.eraseDocuments.delete(d);d.body?.classList.remove('noctilucent-eraser-pdf-document');d.getElementById('noctilucent-pdf-eraser-cursor')?.remove();}this.detachSticky(d);d.defaultView?.removeEventListener('keydown',this.undoKeys.get(d),true);}this.undoKeys.clear();this.docs.clear();this.views.clear();}
};

// EPUB adapter: only caronchen ePub Reader, no reader patches, no EPUB writes.
const epubType=a=>typeof a?.type==='string'&&a.type.startsWith('epub-');
const epubChapterLabel=a=>T('章節')+' '+(Number(a.epubAnchor?.chapter)+1);
const epubFingerprint=t=>{let a=2166136261,b=5381;for(let i=0;i<t.length;i++){a=Math.imul(a^t.charCodeAt(i),16777619);b=Math.imul(b,33)^t.charCodeAt(i);}return t.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);};
class NoctilucentEpubAdapter {
 constructor(p){this.p=p;this.views=new Map();this.mode='';this.last=null;this.dead=false;this.adjustId=null;}
 candidate(leaf){const v=leaf?.view,root=v?.containerEl,path=v?.file?.path;if(!this.p.moduleEnabled('epub')||!path?.toLowerCase().endsWith('.epub')||v.getViewType?.()!=='epub'||!root)return null;
  // Only the selected reader's enabled plugin is accepted; never attach to arbitrary EPUB views.
  const plugins=this.p.app.plugins;if(!plugins?.getPlugin?.('obsidian-epub-plugin')&&!plugins?.plugins?.['obsidian-epub-plugin'])return null;
  const reading=root.querySelector('.epub-container');return reading?{leaf,root,path,reading}:null;}
 nodes(d){const w=d.createTreeWalker(d.body,4),nodes=[];let text='';while(w.nextNode()){const n=w.currentNode;if(!n.data||n.parentElement?.closest('script,style,template,noscript,textarea,svg, [data-noctilucent-epub]'))continue;nodes.push({n,start:text.length,end:text.length+n.data.length});text+=n.data;}return {nodes,text,fingerprint:epubFingerprint(text)};}
 offset(index,n,o){const x=index.nodes.find(x=>x.n===n);if(x&&o>=0&&o<=n.data.length)return x.start+o;return -1;}
 range(s,start,end){if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start)return null;const x=s.index.nodes.find(n=>start>=n.start&&start<n.end),y=s.index.nodes.find(n=>end>n.start&&end<=n.end);if(!x||!y)return null;const r=s.doc.createRange();r.setStart(x.n,start-x.start);r.setEnd(y.n,end-y.start);return r;}
 anchor(s,start,end){const t=s.index.text;return {version:1,chapter:s.chapter,fingerprint:s.index.fingerprint,start,end,quote:t.slice(start,end),prefix:t.slice(Math.max(0,start-48),start),suffix:t.slice(end,end+48)};}
 resolve(s,a){if(!a||a.chapter!==s.chapter||!a.quote)return null;const t=s.index.text,q=a.quote;if(a.fingerprint===s.index.fingerprint&&t.slice(a.start,a.end)===q)return this.range(s,a.start,a.end); // changed content: exact quote and both contexts, unique only
  let match=-1,at=-1;while((at=t.indexOf(q,at+1))!==-1){if((a.prefix&&t.slice(Math.max(0,at-a.prefix.length),at)!==a.prefix)||(a.suffix&&t.slice(at+q.length,at+q.length+a.suffix.length)!==a.suffix))continue;if(match!==-1)return null;match=at;}return match>=0&&(a.prefix||a.suffix)?this.range(s,match,match+q.length):null;}
 imageAnchor(s,img){if(img?.localName==='svg'){const list=[...s.doc.body.querySelectorAll('svg')].filter(x=>!x.parentElement?.closest('svg'));const i=list.indexOf(img);if(i<0)return null;return {version:1,chapter:s.chapter,fingerprint:s.index.fingerprint,svg:i,signature:this.svgSignature(img)};}const list=[...s.doc.body.querySelectorAll('img')],i=list.indexOf(img);if(i<0||!img.naturalWidth||!img.naturalHeight)return null;return {version:1,chapter:s.chapter,fingerprint:s.index.fingerprint,image:i,alt:img.getAttribute('alt')||'',width:img.naturalWidth,height:img.naturalHeight};}
 svgSignature(el){return epubFingerprint(el.outerHTML);}
 image(s,a){if(!a||a.chapter!==s.chapter||a.fingerprint!==s.index.fingerprint)return null;if(Number.isInteger(a.svg)){const el=[...s.doc.body.querySelectorAll('svg')].filter(x=>!x.parentElement?.closest('svg'))[a.svg];return el&&this.svgSignature(el)===a.signature?el:null;}const img=s.doc.body.querySelectorAll('img')[a.image];return img&&img.naturalWidth===a.width&&img.naturalHeight===a.height&&(img.getAttribute('alt')||'')===a.alt?img:null;}
 snapshot(s){const sel=s.doc.getSelection?.();if(!sel||sel.isCollapsed||sel.rangeCount!==1)return null;const r=sel.getRangeAt(0),start=this.offset(s.index,r.startContainer,r.startOffset),end=this.offset(s.index,r.endContainer,r.endOffset);if(start<0||end<=start||end-start>12000)return null;const a=this.anchor(s,start,end);if(!a.quote.trim()||a.quote!==r.toString())return null;return {s,anchor:a};}
 button(v,parent,label,title,fn,icon){const b=v.root.ownerDocument.createElement('button');b.type='button';b.textContent=label;b.title=T(title);b.setAttribute('aria-label',T(title));b.addEventListener('mousedown',e=>e.preventDefault());b.onclick=fn;if(icon)setIcon(b,icon);parent.append(b);return b;}
 toolbar(v){v.mode??='';const p=this.p,d=v.root.ownerDocument,bar=d.createElement('div');bar.className='noctilucent-md-bar noctilucent-epub-bar';v.root.classList.add('noctilucent-md-floating-host');v.root.append(bar);v.bar=bar;
  const pos=p.toolbarState(v,'reader').pos;if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y)){bar.style.left=Math.max(0,Math.min(pos.x,v.root.clientWidth-64))+'px';bar.style.top=Math.max(0,Math.min(pos.y,v.root.clientHeight-80))+'px';}else{bar.style.top='60px';bar.style.right='12px';}
  const b=(label,title,fn,icon,parent=bar)=>this.button(v,parent,label,title,fn,icon);
  const grip=b('⠿','拖曳文字閱讀工具列',()=>{});grip.className='noctilucent-md-grip';p.drag(grip,bar,v.root,()=>{p.toolbarState(v,'reader').pos=p.db.mdToolbarPos={x:bar.offsetLeft,y:bar.offsetTop};p.save();});
  const toggle=b('','切換工具列顯示方式',()=>p.cycleToolbarDisplay('reader',v));toggle.className='noctilucent-layout-toggle';
  const group=d.createElement('div');group.className='noctilucent-highlight-group';bar.append(group);
  v.cont=b('','EPUB 連續高亮',()=>this.setMode(v.mode==='highlight'?'':'highlight',v),null,group);v.cont.className='noctilucent-md-mode';
  b('▰','高亮目前選取的文字',()=>this.addSelection(v,false),null,group);
  v.free=b('','EPUB 自由筆記：點擊文字附近',()=>this.setMode(v.mode==='free'?'':'free',v),'sticky-note');
  v.region=b('','EPUB 圖片區域高亮：在同一張圖片內拖曳',()=>this.setMode(v.mode==='region'?'':'region',v),'scan');
  v.erase=b('','EPUB 橡皮擦：點擊標記',()=>this.setMode(v.mode==='erase'?'':'erase',v),'eraser');v.erase.classList.add('noctilucent-eraser');
  const palette=d.createElement('div');palette.className='noctilucent-toolbar-palette';bar.append(palette);COLORS.forEach((c,i)=>{const x=b('●','使用色票 ',()=>{p.toolbarState(v,'reader').color=p.db.color=i;p.save();p.mdRefreshPalette();this.ui();},null,palette);x.style.color=c;x.dataset.epubColor=i;x.title=T('使用色票 ')+(i+1);});
  b('↶','撤回此文件的標記',()=>{if(!p.undoHighlight(v.path))new Notice(T('本次工作階段沒有可撤回的標記'));});b('↷','重做此文件的標記',()=>{if(!p.redoHighlight(v.path))new Notice(T('沒有可重做的標記'));});b('☰','開啟或收起此文件的批註側邊欄',()=>p.toggleSidebar(v.path));v.lastLayout=null;p.applyToolbarDisplay(bar,'reader',v);this.ui();}
 setMode(mode,v){if(!v)v=this.views.get(this.p.app.workspace.activeLeaf);if(!v)return;v.mode=mode;v.adjustId=null;v.last=null;for(const s of v.frames.values())s.cancel?.();this.ui();}
 ui(){for(const v of this.views.values()){if(!v.bar)continue;v.cont.textContent=T('連續：')+T(v.mode==='highlight'?'開':'關');for(const [b,m] of [[v.cont,'highlight'],[v.free,'free'],[v.region,'region'],[v.erase,'erase']])b.setAttribute('aria-pressed',String(v.mode===m));for(const b of v.bar.querySelectorAll('[data-epub-color]'))b.setAttribute('aria-pressed',String(+b.dataset.epubColor===this.p.toolbarState(v,'reader').color));const layout=this.p.toolbarState(v,'reader').layout;if(v.lastLayout!==layout){v.lastLayout=layout;this.p.applyToolbarDisplay(v.bar,'reader',v);}}}
 attach(v,frame,doc,chapter){const win=doc.defaultView;if(!win?.CSS?.highlights||!win.Highlight||!doc.head||!doc.body)return null;const s={v,frame,doc,chapter,index:this.nodes(doc),dirty:true,ranges:new Map(),marks:new Map()};
  const style=doc.createElementNS('http://www.w3.org/1999/xhtml','style');style.setAttribute('data-noctilucent-epub','');style.textContent=COLORS.map((c,i)=>`::highlight(noctilucent-epub-${i}){background-color:${c}70;}`).join('\n');doc.head.append(style);s.style=style;
  const layer=v.root.ownerDocument.createElement('div');layer.className='noctilucent-epub-layer';v.root.append(layer);s.layer=layer;
  s.up=e=>this.up(s,e);s.down=e=>this.down(s,e);s.move=e=>this.move(s,e);s.cancel=()=>{if(s.gesture?.adjust&&s.gesture.initial){s.gesture.adjust.epubRect={...s.gesture.initial};this.refresh();}s.gesture=null;s.preview?.remove();s.preview=null;};s.key=e=>{if(e.key==='Escape'){this.setMode('',s.v);return;}if(e.isComposing||e.altKey||e.shiftKey||!(e.ctrlKey||e.metaKey)||e.target?.closest?.('input,textarea,[contenteditable=true]'))return;const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopPropagation();if(!e.repeat)(k==='z'?this.p.undoHighlight(v.path):this.p.redoHighlight(v.path));}};
  s.context=e=>{if(s.v.mode==='region'||s.v.mode==='adjust'||s.v.mode==='erase'||e.shiftKey||e.defaultPrevented||e.target?.closest?.('a,button,input,textarea')||s.doc.getSelection()?.toString())return;const anchor=this.pointAnchor(s,e);if(!anchor)return;e.preventDefault();e.stopPropagation();const menu=new Menu();menu.addItem(i=>i.setTitle(T('新增自由批註')).setIcon('sticky-note').onClick(()=>{if(s.v.frames.get(s.frame)===s)this.add(s,'epub-note',anchor,null,true);}));const f=s.frame.getBoundingClientRect();menu.showAtPosition({x:f.left+e.clientX*f.width/(s.frame.clientWidth||f.width),y:f.top+e.clientY*f.height/(s.frame.clientHeight||f.height)});};s.dragstart=e=>{if((s.v.mode==='region'||s.v.mode==='adjust')&&s.gesture)e.preventDefault();};doc.addEventListener('contextmenu',s.context,true);doc.addEventListener('dragstart',s.dragstart,true);s.load=()=>{s.dirty=true;};doc.addEventListener('load',s.load,true);doc.addEventListener('pointerdown',s.down,true);doc.addEventListener('pointermove',s.move,true);doc.addEventListener('pointerup',s.up,true);doc.addEventListener('pointercancel',s.cancel,true);win.addEventListener('blur',s.cancel);doc.addEventListener('keydown',s.key,true);
  s.observer=new win.MutationObserver(()=>{s.dirty=true;s.contentDirty=true;});s.observer.observe(doc.body,{subtree:true,childList:true,characterData:true});return s;}
 detach(s){s.cancel?.();s.doc.removeEventListener('contextmenu',s.context,true);s.doc.removeEventListener('dragstart',s.dragstart,true);s.observer?.disconnect();s.doc.removeEventListener('load',s.load,true);s.doc.removeEventListener('pointerdown',s.down,true);s.doc.removeEventListener('pointermove',s.move,true);s.doc.removeEventListener('pointerup',s.up,true);s.doc.removeEventListener('pointercancel',s.cancel,true);s.doc.removeEventListener('keydown',s.key,true);s.doc.defaultView?.removeEventListener('blur',s.cancel);try{for(let i=0;i<8;i++)s.doc.defaultView?.CSS?.highlights?.delete('noctilucent-epub-'+i);}catch{}s.style?.remove();s.layer?.remove();if(s.v.last?.s===s)s.v.last=null;}
 dispose(v){for(const s of v.frames.values())this.detach(s);v.frames.clear();this.p.mdCloseAllCards(v);v.bar?.remove();v.root.classList.remove('noctilucent-md-floating-host');}
 refresh(){if(this.dead)return;const p=this.p,live=new Set();if(p.moduleEnabled('epub'))for(const leaf of p.app.workspace.getLeavesOfType('epub')){const c=this.candidate(leaf);if(!c)continue;live.add(leaf);let v=this.views.get(leaf);if(v&&(v.path!==c.path||v.readerHost!==c.reading||v.root!==c.root)){this.dispose(v);this.views.delete(leaf);v=null;}if(!v){v={...c,readerHost:c.reading,reading:c.root,kind:'epub',frames:new Map(),cards:new Map()};this.views.set(leaf,v);this.toolbar(v);}const seen=new Set();for(const frame of c.reading.querySelectorAll('.epub-view > iframe')){let doc;try{doc=frame.contentDocument;}catch{continue;}const ref=frame.parentElement.getAttribute('ref'),chapter=Number(ref);if(!doc?.body||ref===null||ref===''||!Number.isSafeInteger(chapter)||chapter<0)continue;seen.add(frame);let s=v.frames.get(frame);if(s&&(s.doc!==doc||s.chapter!==chapter||s.body!==doc.body)){this.detach(s);v.frames.delete(frame);s=null;}if(!s){s=this.attach(v,frame,doc,chapter);if(!s)continue;s.body=doc.body;v.frames.set(frame,s);}if(s.contentDirty){s.index=this.nodes(doc);s.contentDirty=false;s.dirty=true;}this.paint(s);}
   for(const [frame,s] of v.frames)if(!seen.has(frame)){this.detach(s);v.frames.delete(frame);}for(const [id] of v.cards)if(!p.db.items.some(a=>a.id===id&&a.path===v.path))p.mdRemoveCard(v,id);
  }for(const [leaf,v] of this.views)if(!live.has(leaf)){this.dispose(v);this.views.delete(leaf);}if(!this.views.size&&this.mode)this.setMode('');this.ui();}
 // Rectangles are mapped into the parent EPUB view, outside the book DOM.
 box(s,r){const f=s.frame.getBoundingClientRect(),h=s.layer.getBoundingClientRect(),sx=f.width/(s.frame.clientWidth||f.width||1),sy=f.height/(s.frame.clientHeight||f.height||1);return {left:f.left-h.left+r.left*sx,top:f.top-h.top+r.top*sy,width:r.width*sx,height:r.height*sy};}
 place(s,el,r){const b=this.box(s,r);Object.assign(el.style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'});}
 clip(s){const h=s.layer.getBoundingClientRect(),f=s.frame.getBoundingClientRect(),v=s.v.readerHost.getBoundingClientRect();const l=Math.max(h.left,f.left,v.left),t=Math.max(h.top,f.top,v.top),r=Math.min(h.right,f.right,v.right),b=Math.min(h.bottom,f.bottom,v.bottom);s.layer.style.visibility=r>l&&b>t?'visible':'hidden';s.layer.style.clipPath=`inset(${Math.max(0,t-h.top)}px ${Math.max(0,h.right-r)}px ${Math.max(0,h.bottom-b)}px ${Math.max(0,l-h.left)}px)`;return {left:l,top:t,right:r,bottom:b};}
 visibleRect(s,r){const f=s.frame.getBoundingClientRect(),v=s.v.readerHost.getBoundingClientRect(),sx=f.width/(s.frame.clientWidth||f.width||1),sy=f.height/(s.frame.clientHeight||f.height||1);return r.width>0&&r.height>0&&f.left+r.right*sx>Math.max(f.left,v.left)&&f.left+r.left*sx<Math.min(f.right,v.right)&&f.top+r.bottom*sy>Math.max(f.top,v.top)&&f.top+r.top*sy<Math.min(f.bottom,v.bottom);}
 imageRect(s,a){const img=this.image(s,a.epubAnchor);if(!img)return null;const b=img.getBoundingClientRect(),q=a.epubRect;if(!q||!b.width||!b.height)return null;return {left:b.left+q.x*b.width,top:b.top+q.y*b.height,width:q.w*b.width,height:q.h*b.height};}
 paint(s){const p=this.p;if(s.rev!==p.renderRev||s.dirty){s.rev=p.renderRev;s.dirty=false;s.ranges.clear();const colors=COLORS.map(()=>[]);for(const a of p.db.items){if(!epubType(a)||a.path!==s.v.path||a.epubAnchor?.chapter!==s.chapter)continue;if(a.type==='epub-highlight'||a.type==='epub-note'){const r=this.resolve(s,a.epubAnchor);if(!r)continue;s.ranges.set(a.id,{a,r});if(a.type==='epub-highlight')colors[Math.max(0,COLORS.indexOf(a.color))].push(r);}else if(a.type==='epub-region'&&this.image(s,a.epubAnchor))s.ranges.set(a.id,{a});}const registry=s.doc.defaultView.CSS.highlights;colors.forEach((r,i)=>{const k='noctilucent-epub-'+i;if(r.length){if(!sameHighlightRanges(registry.get(k),r))registry.set(k,new s.doc.defaultView.Highlight(...r));}else registry.delete(k);});}
  const clip=this.clip(s);const keep=new Set();for(const [id,{a,r}] of s.ranges){let rect;if(a.type==='epub-region')rect=this.imageRect(s,a);else {const rs=this.markerRects(s,r,a.type==='epub-note');if(rs.length){const b=a.type==='epub-note'?rs[0]:rs.at(-1),size=a.type==='epub-note'?19:12;rect={left:a.type==='epub-note'?b.left:b.right-size,top:b.top-size*.75,width:size,height:size};}}if(!rect)continue;keep.add(id);let el=s.marks.get(id);if(!el){el=s.layer.ownerDocument.createElement(a.type==='epub-region'?'div':'button');el.className=a.type==='epub-region'?'noctilucent-epub-region':a.type==='epub-note'?'noctilucent-marker noctilucent-epub-note':'noctilucent-marker noctilucent-epub-comment';el.dataset.annotationId=id;if(a.type!=='epub-region'){el.type='button';if(a.type==='epub-note')setIcon(el,'sticky-note');el.onclick=e=>{e.stopPropagation();const current=p.db.items.find(x=>x.id===id);if(!current)return;s.v.mode==='erase'?p.eraseAnnotation(current):this.card(s,current,true,e.detail?{x:e.clientX,y:e.clientY}:null);};el.onpointerdown=e=>e.stopPropagation();el.onmousedown=e=>{e.preventDefault();e.stopPropagation();};}s.layer.append(el);s.marks.set(id,el);}if(a.type==='epub-highlight')el.textContent=a.note?'▣':'+';el.style.setProperty('--noc-epub-color',a.color);if(a.type!=='epub-region'){el.style.setProperty('background-color',a.color,'important');el.style.setProperty('color','#333','important');}el.title=a.note||T(a.type==='epub-note'?'自由批註':a.type==='epub-region'?'區域高亮':'新增批註／修改顏色');if(a.type==='epub-region'){this.p.areaPaint(el,a);this.place(s,el,rect);}else this.placeMarker(s,el,rect,clip);}for(const [id,el] of s.marks)if(!keep.has(id)){el.remove();s.marks.delete(id);}}
 markerRects(s,r,note){let rs=[...r.getClientRects()];if(note&&!rs.some(b=>b.width>0&&b.height>0)){const n=r.startContainer;if(n?.nodeType===3){const start=r.startOffset;for(let dist=1;dist<=Math.min(32,n.length);dist++){let found=false;for(const i of [start+dist,start-dist]){if(i<0||i>=n.length||!n.data[i]?.trim())continue;const q=s.doc.createRange();q.setStart(n,i);q.setEnd(n,i+1);const bs=[...q.getClientRects()].filter(b=>b.width>0&&b.height>0);if(bs.length){rs=bs;found=true;break;}}if(found)break;}}}return rs.filter(b=>this.visibleRect(s,b));}
 placeMarker(s,el,r,clip){const h=s.layer.getBoundingClientRect(),b=this.box(s,r),w=r.width,z=r.height;const l=clip.left-h.left,t=clip.top-h.top,right=clip.right-h.left,bottom=clip.bottom-h.top;if(right-l<w||bottom-t<z){el.style.visibility='hidden';return;}el.style.visibility='visible';Object.assign(el.style,{left:Math.max(l,Math.min(b.left,right-w))+'px',top:Math.max(t,Math.min(b.top,bottom-z))+'px',width:w+'px',height:z+'px'});}
 async regionSource(s,img){if(img.localName!=='svg')return img;const win=s.doc.defaultView,clone=img.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');for(const el of clone.querySelectorAll('script,foreignObject'))el.remove();for(const el of [clone,...clone.querySelectorAll('*')]){for(const a of [...el.attributes])if(/^on/i.test(a.name))el.removeAttribute(a.name);for(const key of ['href','xlink:href']){const href=el.getAttribute(key);if(!href||href.startsWith('#')||href.startsWith('data:image/'))continue;if(!href.startsWith('blob:'))throw Error(T('EPUB：圖片資源無法安全擷取'));const response=await win.fetch(href);if(!response.ok)throw Error(T('EPUB：圖片資源無法安全擷取'));const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error(T('EPUB：圖片資源無法安全擷取'));el.setAttribute(key,await this.dataURL(win,blob));}}const b=img.getBoundingClientRect();clone.setAttribute('width',String(Math.max(1,b.width)));clone.setAttribute('height',String(Math.max(1,b.height)));const xml=new win.XMLSerializer().serializeToString(clone);const url=win.URL.createObjectURL(new win.Blob([xml],{type:'image/svg+xml'}));try{const decoded=new win.Image();await new Promise((ok,no)=>{decoded.onload=ok;decoded.onerror=()=>no(Error(T('圖片編碼失敗')));decoded.src=url;});return decoded;}finally{win.URL.revokeObjectURL(url);}}
 dataURL(win,blob){return new Promise((ok,no)=>{const r=new win.FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(Error(T('圖片編碼失敗')));r.readAsDataURL(blob);});}
 changeRegion(a,changes){
  if(!this.p.db.items.includes(a)||a.type!=='epub-region'||Object.keys(changes).every(k=>a[k]===changes[k]))return;
  this.p.invalidateRedo(a.path);
  this.p.undoHistory.push({kind:'epub-region-change',id:a.id,path:a.path,before:{epubRect:{...a.epubRect},areaStyle:a.areaStyle||'both',opacity:Number.isFinite(a.opacity)?a.opacity:.15}});
  Object.assign(a,changes,{modified:Date.now()});this.p.save();this.refresh();this.p.refreshSidebars();
 }
 beginRegionAdjust(id,v){
  const a=this.p.db.items.find(x=>x.id===id&&x.type==='epub-region');if(!a)return;
  if(!v)return;this.setMode('adjust',v);v.adjustId=id;
  new Notice(T('EPUB：拖曳區域內部可移動；拖曳四角可調整大小，Esc 結束'));
 }
 findRegion(id){
  const a=this.p.db.items.find(x=>x.id===id&&x.type==='epub-region');if(!a)throw Error(T('找不到區域批註'));
  this.refresh();for(const v of this.views.values())if(v.path===a.path)for(const state of v.frames.values()){
   const img=this.image(state,a.epubAnchor);if(img)return {a,s:state,img};
  }throw Error(T('EPUB：請手動切換至對應章節後再跳轉'));
 }
 async regionBlob(id){
  const {a,s,img}=this.findRegion(id),win=s.doc.defaultView,src=await this.regionSource(s,img),q=a.epubRect;
  const W=src.naturalWidth||src.width?.baseVal?.value||src.width,H=src.naturalHeight||src.height?.baseVal?.value||src.height;
  if(!W||!H||!q)throw Error(T('圖片編碼失敗'));
  const x=Math.max(0,Math.floor(q.x*W)),y=Math.max(0,Math.floor(q.y*H)),right=Math.min(W,Math.ceil((q.x+q.w)*W-1e-8)),bottom=Math.min(H,Math.ceil((q.y+q.h)*H-1e-8));
  if(right<=x||bottom<=y)throw Error(T('區域不在畫布內'));
  const canvas=s.layer.ownerDocument.createElement('canvas'),scale=Math.min(1,4096/Math.max(right-x,bottom-y));
  canvas.width=Math.max(1,Math.round((right-x)*scale));canvas.height=Math.max(1,Math.round((bottom-y)*scale));
  canvas.getContext('2d').drawImage(src,x,y,right-x,bottom-y,0,0,canvas.width,canvas.height);
  const blob=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error(T('PNG 轉換失敗'))),'image/png'));
  return {blob,a,s,win};
 }
 async copyRegionImage(id){try{
  const {blob,s}=await this.regionBlob(id),win=s.layer.ownerDocument.defaultView;
  await win.navigator.clipboard.write([new win.ClipboardItem({'image/png':blob})]);
  new Notice(T('已複製原始區域圖片'));
 }catch(e){new Notice(T('無法複製圖片：')+e.message);}}
 async copyRegion(id){try{const a=this.p.db.items.find(x=>x.id===id&&x.type==='epub-region');if(!a)throw Error(T('找不到區域批註'));this.refresh();let found=null;for(const v of this.views.values())if(v.path===a.path)for(const s of v.frames.values()){const img=this.image(s,a.epubAnchor);if(img){found={s,img};break;}}if(!found)throw Error(T('EPUB：請手動切換至對應章節後再跳轉'));const {s,img}=found,win=s.doc.defaultView,src=await this.regionSource(s,img),q=a.epubRect,W=src.naturalWidth,H=src.naturalHeight;if(!W||!H||!q)throw Error(T('圖片編碼失敗'));const x=Math.max(0,Math.floor(q.x*W)),y=Math.max(0,Math.floor(q.y*H)),right=Math.min(W,Math.ceil((q.x+q.w)*W-1e-8)),bottom=Math.min(H,Math.ceil((q.y+q.h)*H-1e-8));if(right<=x||bottom<=y)throw Error(T('區域不在畫布內'));const canvas=s.layer.ownerDocument.createElement('canvas'),scale=Math.min(1,4096/Math.max(right-x,bottom-y));canvas.width=Math.max(1,Math.round((right-x)*scale));canvas.height=Math.max(1,Math.round((bottom-y)*scale));canvas.getContext('2d').drawImage(src,x,y,right-x,bottom-y,0,0,canvas.width,canvas.height);const blob=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error(T('PNG 轉換失敗'))),'image/png'));const data=await this.dataURL(win,blob),note=a.note||'',esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const html='<div><p><img src="'+data+'" alt="EPUB"></p>'+(note?'<p>'+esc(note).replace(/\r\n|\r|\n/g,'<br>')+'</p>':'')+'</div>';let native;try{native=require('electron').clipboard;}catch{}const host=s.layer.ownerDocument.defaultView;if(native?.write)native.write({html,text:note});else await host.navigator.clipboard.write([new host.ClipboardItem({'text/html':new host.Blob([html],{type:'text/html'}),'text/plain':new host.Blob([note],{type:'text/plain'})})]);new Notice(T('已複製區域圖片＋批註（富文字貼上）'));}catch(e){new Notice(T('無法複製圖片＋批註：')+e.message);}}
 hostPoint(s,e){const f=s.frame.getBoundingClientRect(),sx=f.width/(s.frame.clientWidth||f.width||1),sy=f.height/(s.frame.clientHeight||f.height||1);return {x:f.left+e.clientX*sx,y:f.top+e.clientY*sy};}
 card(s,a,focus=true,point=null){
  if(!point){const mark=s.marks.get(a.id),b=mark?.getBoundingClientRect(),clip=this.clip(s);if(b&&b.width&&b.height&&b.right>clip.left&&b.left<clip.right&&b.bottom>clip.top&&b.top<clip.bottom){point={x:(Math.max(b.left,clip.left)+Math.min(b.right,clip.right))/2,y:(Math.max(b.top,clip.top)+Math.min(b.bottom,clip.bottom))/2};}}
  this.p.mdCard(s.v,a,null,focus,point);
 }
 add(s,type,anchor,rect,comment){const p=this.p;if(!this.views.has(s.v.leaf)||!p.moduleEnabled('epub'))return;let a=p.db.items.find(x=>x.type===type&&x.path===s.v.path&&JSON.stringify(x.epubAnchor)===JSON.stringify(anchor)&&JSON.stringify(x.epubRect||null)===JSON.stringify(rect||null));if(!a){const now=Date.now();a={id:globalThis.crypto.randomUUID(),type,path:s.v.path,page:0,epubAnchor:anchor,text:type==='epub-highlight'?anchor.quote:'',color:COLORS[p.toolbarState(s.v,'reader').color]||COLORS[0],note:'',created:now,modified:now};if(rect){a.epubRect=rect;a.areaStyle='both';a.opacity=.15;}p.db.items.push(a);p.invalidateRedo(a.path);p.undoHistory.push({kind:'create',id:a.id,path:a.path});p.save();this.refresh();p.refreshSidebars();}if(comment)this.card(s,a);return a;}
 addSelection(v,comment){let snap=null;for(const s of v.frames.values()){const x=this.snapshot(s);if(x){snap=x;break;}}if(!snap&&v.last?.s.v===v&&v.frames.get(v.last.s.frame)===v.last.s)snap=v.last;if(!snap||!this.resolve(snap.s,snap.anchor)){new Notice(T('EPUB：請先選取文字'));return;}v.last=null;const added=this.add(snap.s,'epub-highlight',snap.anchor,null,comment);if(added)snap.s.doc.getSelection()?.removeAllRanges();}
 pointAnchor(s,e){const r=s.doc.caretRangeFromPoint?.(e.clientX,e.clientY);if(!r)return null;const at=this.offset(s.index,r.startContainer,r.startOffset),t=s.index.text;if(at<0||!t.length)return null;let start=Math.min(at,t.length-1);if(!t[start]?.trim()){const near=s.index.nodes.find(n=>n.start<=start&&start<n.end);if(near){const next=near.n.data.slice(start-near.start).search(/\S/);if(next>=0)start+=next;}}return this.anchor(s,start,start+1);}
 down(s,e){
  if(e.button===0&&s.v.mode==='adjust'&&s.v.adjustId){
   const a=this.p.db.items.find(x=>x.id===s.v.adjustId&&x.type==='epub-region'&&x.path===s.v.path&&x.epubAnchor?.chapter===s.chapter);
   const img=a&&this.image(s,a.epubAnchor),r=a&&this.imageRect(s,a),b=img?.getBoundingClientRect();
   if(!a||!r||!b?.width||!b.height)return;
   const pad=12,near=e.clientX>=r.left-pad&&e.clientX<=r.left+r.width+pad&&e.clientY>=r.top-pad&&e.clientY<=r.top+r.height+pad;
   if(!near)return;
   const left=Math.abs(e.clientX-r.left)<=pad,right=Math.abs(e.clientX-r.left-r.width)<=pad,top=Math.abs(e.clientY-r.top)<=pad,bottom=Math.abs(e.clientY-r.top-r.height)<=pad;
   const handle=(left||right)&&(top||bottom)?{x:left?'left':'right',y:top?'top':'bottom'}:null;
   s.gesture={pointer:e.pointerId,adjust:a,initial:{...a.epubRect},imageBox:b,startX:e.clientX,startY:e.clientY,handle};
   try{s.doc.documentElement.setPointerCapture(e.pointerId);}catch{}
   e.preventDefault();e.stopPropagation();return;
  }
  if(e.button!==0||s.v.mode!=='region')return;s.doc.getSelection()?.removeAllRanges();s.gesture={pointer:e.pointerId,x:e.clientX,y:e.clientY,rect:null};try{s.doc.documentElement.setPointerCapture(e.pointerId);}catch{}e.preventDefault();e.stopPropagation();}
 move(s,e){const g=s.gesture;if(!g||g.pointer!==e.pointerId)return;
  if(g.adjust){const q=g.initial,dx=(e.clientX-g.startX)/g.imageBox.width,dy=(e.clientY-g.startY)/g.imageBox.height;
   let x=q.x,y=q.y,w=q.w,h=q.h;
   if(!g.handle){x=Math.max(0,Math.min(1-w,x+dx));y=Math.max(0,Math.min(1-h,y+dy));}
   else{const minX=Math.min(q.w,5/g.imageBox.width),minY=Math.min(q.h,5/g.imageBox.height);
    if(g.handle.x==='left'){const right=x+w;x=Math.max(0,Math.min(right-minX,x+dx));w=right-x;}
    else{w=Math.max(minX,Math.min(1-x,w+dx));}
    if(g.handle.y==='top'){const bottom=y+h;y=Math.max(0,Math.min(bottom-minY,y+dy));h=bottom-y;}
    else{h=Math.max(minY,Math.min(1-y,h+dy));}
   }
   g.adjust.epubRect={x,y,w,h};this.refresh();e.preventDefault();e.stopPropagation();return;
  }g.rect={left:Math.min(e.clientX,g.x),top:Math.min(e.clientY,g.y),width:Math.abs(e.clientX-g.x),height:Math.abs(e.clientY-g.y)};if(!s.preview){s.preview=s.layer.ownerDocument.createElement('div');s.preview.className='noctilucent-epub-region';s.preview.style.setProperty('--noc-epub-color',COLORS[this.p.toolbarState(s.v,'reader').color]||COLORS[0]);s.layer.append(s.preview);}this.place(s,s.preview,g.rect);e.preventDefault();}
 regionTarget(s,r){if(!r||r.width<5||r.height<5)return null;const imgs=[...s.doc.body.querySelectorAll('img,svg')].filter(x=>!x.parentElement?.closest('svg'));const hits=[];for(const img of imgs){const b=img.getBoundingClientRect(),l=Math.max(r.left,b.left),t=Math.max(r.top,b.top),right=Math.min(r.left+r.width,b.right),bottom=Math.min(r.top+r.height,b.bottom);if(b.width&&b.height&&right-l>=5&&bottom-t>=5){const anchor=this.imageAnchor(s,img);if(anchor)hits.push({anchor,rect:{x:clamp01((l-b.left)/b.width),y:clamp01((t-b.top)/b.height),w:clamp01((right-l)/b.width),h:clamp01((bottom-t)/b.height)}});}}return hits.length===1?hits[0]:null;}
 up(s,e){if(e.button!==0)return;
  if(s.v.mode==='adjust'&&s.gesture?.adjust&&s.gesture.pointer===e.pointerId){
   const g=s.gesture,a=g.adjust,changed=JSON.stringify(a.epubRect)!==JSON.stringify(g.initial);
   if(changed){const updated={...a.epubRect};a.epubRect={...g.initial};this.changeRegion(a,{epubRect:updated});}
   s.gesture=null;s.cancel();try{s.doc.documentElement.releasePointerCapture(e.pointerId);}catch{}e.preventDefault();e.stopPropagation();return;
  }
  if(s.v.mode==='region'){const g=s.gesture;if(!g||g.pointer!==e.pointerId)return;this.move(s,e);const hit=this.regionTarget(s,g.rect);s.cancel();try{s.doc.documentElement.releasePointerCapture(e.pointerId);}catch{}if(hit)this.add(s,'epub-region',hit.anchor,hit.rect,true);else new Notice(T('EPUB：區域高亮目前僅支援單張圖片'));e.preventDefault();e.stopPropagation();return;}
  if(s.v.mode==='free'){const anchor=this.pointAnchor(s,e);if(!anchor){new Notice(T('EPUB：請點擊文字附近'));return;}this.add(s,'epub-note',anchor,null,true);this.setMode('',s.v);e.preventDefault();e.stopPropagation();return;}
  const snap=this.snapshot(s);if(snap&&s.v.mode!=='erase'){s.v.last=snap;if(s.v.mode==='highlight')this.addSelection(s.v,false);return;}s.v.last=null;
  if(e.target?.closest?.('a,button,input,textarea,select'))return;const hit=[...s.ranges.values()].reverse().find(({a,r})=>{const rects=a.type==='epub-region'?[this.imageRect(s,a)]:a.type==='epub-highlight'?[...r.getClientRects()]:[];return rects.some(b=>b&&e.clientX>=b.left&&e.clientX<=b.left+b.width&&e.clientY>=b.top&&e.clientY<=b.top+b.height);});if(hit){if(s.v.mode==='erase'){e.preventDefault();e.stopPropagation();this.p.eraseAnnotation(hit.a);}else this.card(s,hit.a,true,this.hostPoint(s,e));}}
 async jump(a){let v=[...this.views.values()].find(v=>v.path===a.path);if(!v){const file=this.p.app.vault.getAbstractFileByPath(a.path);if(!file)return;const leaf=this.p.app.workspace.getLeaf('tab');await leaf.openFile(file);await this.p.app.workspace.revealLeaf(leaf);this.refresh();v=this.views.get(leaf);}if(!v){new Notice(T('EPUB：請先使用 ePub Reader 開啟文件'));return;}await this.p.app.workspace.revealLeaf(v.leaf);this.refresh();const s=[...v.frames.values()].find(s=>s.ranges.has(a.id));const hit=s?.ranges.get(a.id);if(!hit){new Notice(T('EPUB：請手動切換至對應章節後再跳轉'));return;}const el=hit.r?.startContainer.parentElement||this.image(s,a.epubAnchor);el?.scrollIntoView({block:'center',inline:'center'});s.frame.scrollIntoView({block:'nearest',inline:'nearest'});}
 stop(){this.dead=true;for(const v of this.views.values())this.dispose(v);this.views.clear();this.last=null;}
}

const VERIFIED_SPACING_JSON=/*__VERIFIED_SPACING_JSON__*/"";
