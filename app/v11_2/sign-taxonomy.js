(() => {
  const TYPES=[
    {code:'facade-fascia',label:'Bina cephe / fascia tabelası',group:'building',aliases:['wall','fascia','cephe','sign band','duvar']},
    {code:'storefront',label:'Dükkan / mağaza tabelası',group:'building',aliases:['storefront','shop','mağaza','dükkan']},
    {code:'channel-letter',label:'Kanal / kutu harf',group:'building',aliases:['channel letters','kutu harf','dimensional letters']},
    {code:'cabinet-lightbox',label:'Işıklı kutu / cabinet tabela',group:'building',aliases:['cabinet','lightbox','ışıklı kutu']},
    {code:'projecting-blade',label:'Çıkma / blade tabela',group:'building',aliases:['projecting','blade','çıkma','suspended']},
    {code:'awning-canopy',label:'Sundurma / awning / canopy tabelası',group:'building',aliases:['awning','canopy','sundurma']},
    {code:'window',label:'Vitrin / pencere grafiği',group:'building',aliases:['window','vinyl','decal','vitrin']},
    {code:'roof-parapet',label:'Çatı / parapet tabelası',group:'building',aliases:['roof','parapet','çatı']},
    {code:'totem',label:'Totem',group:'freestanding',aliases:['totem']},
    {code:'pylon-pole',label:'Pylon / direk tabelası',group:'freestanding',aliases:['pylon','pole','direk']},
    {code:'monument',label:'Monument / zemin tabelası',group:'freestanding',aliases:['monument','ground','zemin']},
    {code:'directional',label:'Yönlendirme / wayfinding',group:'freestanding',aliases:['directional','wayfinding','yönlendirme']},
    {code:'kiosk',label:'Kiosk / bilgi panosu',group:'freestanding',aliases:['kiosk','information']},
    {code:'a-frame',label:'A-frame / sandwich board',group:'freestanding',aliases:['a-frame','sandwich']},
    {code:'billboard',label:'Billboard / büyük pano',group:'ooh',aliases:['billboard','bulletin','pano']},
    {code:'poster-clp',label:'Poster / CLP / raket',group:'ooh',aliases:['poster','clp','raket','junior poster']},
    {code:'wall-mural',label:'Duvar resmi / wall mural / giydirme',group:'ooh',aliases:['wall mural','mural','duvar giydirme']},
    {code:'digital-led',label:'LED / dijital reklam ekranı',group:'digital',aliases:['digital','led','dooh','screen']},
    {code:'bus-shelter',label:'Durak reklamı / bus shelter',group:'street',aliases:['bus shelter','durak']},
    {code:'street-furniture',label:'Kent mobilyası / sokak panosu',group:'street',aliases:['street furniture','bench','urban panel']},
    {code:'transit-bus',label:'Otobüs / toplu taşıma reklamı',group:'transit',aliases:['bus','transit']},
    {code:'vehicle-wrap',label:'Araç / taksi giydirme',group:'transit',aliases:['vehicle wrap','taxi','rideshare','araç']},
    {code:'mobile-billboard',label:'Mobil billboard / truckside',group:'transit',aliases:['mobile billboard','truckside','truck']},
    {code:'rail-subway',label:'Metro / raylı sistem reklamı',group:'transit',aliases:['rail','subway','metro']},
    {code:'airport',label:'Havalimanı reklamı',group:'transit',aliases:['airport','havalimanı']},
    {code:'place-based',label:'AVM / mekan içi place-based ekran',group:'place',aliases:['place-based','mall','shopping mall','arena']},
    {code:'banner',label:'Branda / vinil banner',group:'temporary',aliases:['banner','vinyl','branda']},
    {code:'fence-wrap',label:'Şantiye çiti / fence wrap',group:'temporary',aliases:['fence wrap','construction','şantiye']},
    {code:'flag',label:'Bayrak / flama reklamı',group:'temporary',aliases:['flag','flama']},
    {code:'menu-directory',label:'Menü / directory / tenant panosu',group:'place',aliases:['menu','directory','tenant']},
    {code:'other',label:'Diğer / kontrol gerekli',group:'other',aliases:['other']}
  ];
  const byCode=Object.fromEntries(TYPES.map(x=>[x.code,x]));
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const load=src=>new Promise((ok,fail)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=fail;i.src=src});
  function add(scores,code,value,reason){scores[code]=(scores[code]||0)+value;(scores._reasons||(scores._reasons={}))[code]=[...((scores._reasons||{})[code]||[]),reason]}
  async function visualStats(data,bbox){
    const img=await load(data),b=bbox||{x:0,y:0,w:img.width,h:img.height},c=document.createElement('canvas'),w=72,h=48;c.width=w;c.height=h;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,b.x,b.y,b.w,b.h,0,0,w,h);const d=x.getImageData(0,0,w,h).data;
    let lum=0,sat=0,hiSat=0,hi=0,lo=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],bb=d[i+2],mx=Math.max(r,g,bb),mn=Math.min(r,g,bb),l=.299*r+.587*g+.114*bb,s=mx?((mx-mn)/mx)*100:0;lum+=l;sat+=s;if(s>48)hiSat++;if(l>225)hi++;if(l<35)lo++}
    const n=d.length/4;return{width:img.width,height:img.height,brightness:lum/n,saturation:sat/n,highSaturation:hiSat/n,brightRatio:hi/n,darkRatio:lo/n}
  }
  async function classify(data,context={}){
    if(window.TabelaSignTypeModel?.classify){
      try{const m=await window.TabelaSignTypeModel.classify(data,context);if(m?.code&&byCode[m.code])return{...m,label:byCode[m.code].label,mode:'trained-model',requiresReview:Number(m.confidence||0)<88,taxonomyVersion:'11.2.0'}}
      catch(error){console.warn('Tabela tip modeli kullanılamadı',error)}
    }
    const shape=context.shape||{},b=shape.bbox||{},stats=await visualStats(data,b),W=stats.width,H=stats.height,aspect=Number(b.w)/Math.max(1,Number(b.h)),area=(Number(b.w)*Number(b.h))/Math.max(1,W*H),cx=(Number(b.x)+Number(b.w)/2)/W,cy=(Number(b.y)+Number(b.h)/2)/H;
    const scores={};add(scores,'storefront',28,'genel ticari tabela adayı');add(scores,'facade-fascia',18,'bina üstü temel aday');
    if(['circle','oval'].includes(shape.shapeType)){add(scores,'projecting-blade',30,'yuvarlak/oval küçük tabela formu');add(scores,'storefront',10,'mağaza kimlik tabelası formu')}
    if(aspect<.58){add(scores,'totem',36,'dikey uzun geometri');add(scores,'pylon-pole',26,'dikey bağımsız tabela olasılığı')}
    if(aspect>3.1){add(scores,'facade-fascia',34,'çok yatay cephe bandı');add(scores,'billboard',19,'geniş pano oranı');add(scores,'banner',12,'yatay branda olasılığı')}
    if(area>.38){add(scores,'facade-fascia',28,'kadrajda geniş cephe alanı');add(scores,'wall-mural',18,'büyük yüzey kaplama olasılığı')}
    if(area<.13&&aspect>.55&&aspect<1.7){add(scores,'poster-clp',22,'küçük standart pano oranı');add(scores,'street-furniture',12,'sokak seviyesi pano olasılığı')}
    if(cy<.28&&aspect>1.5){add(scores,'roof-parapet',17,'kadrajın üst bölümünde yatay yerleşim');add(scores,'facade-fascia',14,'üst cephe yerleşimi')}
    if(cy>.58&&aspect<.9){add(scores,'totem',15,'alt/zemin yönelimli dikey tabela');add(scores,'monument',10,'zemin tabela olasılığı')}
    if(stats.highSaturation>.27&&stats.brightRatio>.10&&['horizontal-rectangle','vertical-rectangle','square'].includes(shape.shapeType)){add(scores,'digital-led',21,'yüksek doygunluk/parlaklık dijital ekran sinyali')}
    if(aspect>1.4&&area>.12&&area<.36&&cy>.35){add(scores,'billboard',14,'orta-büyük yatay bağımsız pano olasılığı')}
    if(cx<.18||cx>.82){add(scores,'projecting-blade',8,'kadraj kenarında çıkma tabela olasılığı')}
    const ranked=Object.entries(scores).filter(([k])=>!k.startsWith('_')).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const top=ranked[0]||['other',1],second=ranked[1]?.[1]||0,margin=top[1]-second;
    const confidence=Math.round(clamp(44+margin*.8+Math.min(18,top[1]*.18),35,78));
    return{code:top[0],label:byCode[top[0]]?.label||byCode.other.label,confidence,mode:'heuristic-taxonomy',requiresReview:true,alternatives:ranked.slice(1).map(([code,score])=>({code,label:byCode[code]?.label,score})),reasons:(scores._reasons?.[top[0]]||[]),metrics:{aspect:+aspect.toFixed(2),areaRatio:+area.toFixed(3),centerX:+cx.toFixed(2),centerY:+cy.toFixed(2),brightness:Math.round(stats.brightness),saturation:Math.round(stats.saturation)},taxonomyVersion:'11.2.0'};
  }
  function installSelect(select){
    if(!select)return;const current=select.value;select.innerHTML='';
    const groups={building:'Bina / Mağaza',freestanding:'Bağımsız',ooh:'Açıkhava',digital:'Dijital',street:'Kent Mobilyası',transit:'Transit / Araç',place:'Mekan İçi',temporary:'Geçici / Uygulama',other:'Diğer'};
    for(const [g,title] of Object.entries(groups)){const items=TYPES.filter(x=>x.group===g);if(!items.length)continue;const og=document.createElement('optgroup');og.label=title;for(const item of items){const o=document.createElement('option');o.value=item.label;o.textContent=item.label;o.dataset.code=item.code;og.appendChild(o)}select.appendChild(og)}
    if([...select.options].some(o=>o.value===current))select.value=current;else select.value='Dükkan / mağaza tabelası';
  }
  function codeForLabel(label){return TYPES.find(x=>x.label===label)?.code||'other'}
  window.TabelaSignTaxonomy={TYPES,byCode,classify,installSelect,codeForLabel,version:'11.2.0-research-taxonomy'};
})();