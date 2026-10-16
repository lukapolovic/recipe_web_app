import { DESIGN_SEED, PALETTES } from './palettes.js';
const grid=document.querySelector('#design-grid');
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let view='discover';
const layouts={"pop": ["The night market", "A top menu, a navy welcome with cartoon produce stickers and bright cookbook covers. Recipe pages read big and left-aligned."], "rose": ["The editorial cookbook", "A left menu, a wide welcome and generous shelves. Recipe pages open into ingredients and instructions."], "sage": ["The farmhouse pinboard", "A top menu, wooden bowls up front and recipes beside the books. Recipe photos sit alongside the method."], "blue": ["The bistro journal", "A slim menu, a tall cover story and a compact cookbook index. Recipes read like a page from a kitchen diary."]};
document.querySelector('#design-seed').textContent=DESIGN_SEED;
function render(){
  grid.dataset.view=view;
  grid.innerHTML=PALETTES.map((palette,index)=>`<article class="palette-study" data-palette-card="${palette.id}"><div class="palette-study-header"><span class="study-number">DESIGN STUDY 0${index+1}</span><h2>${escape(palette.name)}</h2><span class="layout-name">${escape(layouts[palette.id][0])}</span><p>${escape(layouts[palette.id][1])}</p></div><div class="app-preview"><iframe src="/design-preview.html?palette=${palette.id}&designPreview=${view}" title="${escape(palette.name)} ${view==='recipe'?'recipe':'cookbook shelf'} preview" tabindex="-1" aria-hidden="true"></iframe></div><div class="palette-details"><div class="palette-swatches" aria-label="${escape(palette.name)} colour palette">${palette.colors.map((color,i)=>`<span data-swatch="${i}" role="img" aria-label="${escape(color.name)} ${color.hex}"></span>`).join('')}</div><div class="palette-values" aria-hidden="true">${palette.colors.map(color=>`<span>${color.hex.toUpperCase()}</span>`).join('')}</div><div class="study-actions"><a class="try-palette" href="/?palette=${palette.id}">Try this palette →</a><a class="larger-preview" href="/design-preview.html?palette=${palette.id}&designPreview=${view}" target="_blank" rel="noopener">Open larger ↗</a></div></div></article>`).join('');
  document.querySelectorAll('.app-preview').forEach(element=>observer.observe(element));
}
const observer=new ResizeObserver(entries=>{for(const entry of entries){const frame=entry.target.querySelector('iframe');if(frame)frame.style.transform=`scale(${entry.contentRect.width/1100})`;}});
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
  observer.disconnect();view=button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  render();
}));
render();
