(() => {
  let worker = null;

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function crop(img, x, y, w, h, scale = 2.4) {
    const c = makeCanvas(w * scale, h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  function enhance(source, contrast = 2.0, threshold = null) {
    const c = makeCanvas(source.width, source.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    let mean = 0;
    for (let i = 0; i < d.length; i += 4) mean += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    mean /= Math.max(1, d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      g = Math.max(0, Math.min(255, (g - mean) * contrast + 128));
      if (threshold !== null) g = g > threshold ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = g;
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  function cleanText(s) {
    return (s || '')
      .replace(/[|_~`^]+/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+|[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+$/g, '')
      .trim();
  }

  function normalizeSpacedLetters(text) {
    const t = cleanText(text);
    const tokens = t.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) return t;
    const singleish = tokens.filter(x => /^[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,2}$/.test(x)).length;
    if (singleish / tokens.length >= 0.75 && tokens.join('').length <= 28) return tokens.join('');
    return t;
  }

  function key(text) {
    return normalizeSpacedLetters(text).toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
  }

  function quality(text, confidence) {
    const t = normalizeSpacedLetters(text);
    const k = key(t);
    if (k.length < 3) return -999;
    let score = Number(confidence || 0);
    if (k.length >= 4 && k.length <= 24) score += 18;
    if (t.split(/\s+/).length <= 4) score += 8;
    if (/^[A-ZÇĞİÖŞÜ0-9&+\- ]{4,28}$/.test(t.toLocaleUpperCase('tr-TR'))) score += 8;
    return score;
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (!window.Tesseract) throw new Error('OCR motoru yüklenemedi. İnternet bağlantısını kontrol edin.');
    worker = await Tesseract.createWorker('tur+eng', 1, {
      logger: m => {
        if (m && typeof m.progress === 'number' && onProgress) onProgress(Math.round(m.progress * 100), m.status || '');
      }
    });
    return worker;
  }

  async function recognize(w, canvas, psm) {
    await w.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300'
    });
    const r = await w.recognize(canvas);
    const raw = cleanText(r?.data?.text || '');
    const text = normalizeSpacedLetters(raw);
    const confidence = Number(r?.data?.confidence || 0);
    return { text, raw, confidence, score: quality(text, confidence) };
  }

  function guideAlignedROI(img) {
    const camera = document.querySelector('.camera');
    const guide = document.querySelector('.cross');
    if (!camera || !guide) {
      return { x: img.width*0.14, y: img.height*0.39, w: img.width*0.72, h: img.height*0.22 };
    }

    const cr = camera.getBoundingClientRect();
    const gr = guide.getBoundingClientRect();
    if (!cr.width || !cr.height || !gr.width || !gr.height) {
      return { x: img.width*0.14, y: img.height*0.39, w: img.width*0.72, h: img.height*0.22 };
    }

    // The camera uses object-fit: cover. Map the visible green guide back to the raw camera image exactly.
    const scale = Math.max(cr.width / img.width, cr.height / img.height);
    const renderedW = img.width * scale;
    const renderedH = img.height * scale;
    const cropX = (renderedW - cr.width) / 2;
    const cropY = (renderedH - cr.height) / 2;

    const gx = gr.left - cr.left;
    const gy = gr.top - cr.top;
    let x = (gx + cropX) / scale;
    let y = (gy + cropY) / scale;
    let w = gr.width / scale;
    let h = gr.height / scale;

    // Tighten vertically to avoid page text above/below the physical sign lettering.
    y += h * 0.18;
    h *= 0.64;

    x = Math.max(0, Math.min(img.width - 1, x));
    y = Math.max(0, Math.min(img.height - 1, y));
    w = Math.max(1, Math.min(img.width - x, w));
    h = Math.max(1, Math.min(img.height - y, h));
    return { x, y, w, h };
  }

  async function run(photoData, onProgress) {
    const img = await loadImage(photoData);
    const w = await getWorker(onProgress);
    const r = guideAlignedROI(img);
    const roi = crop(img, r.x, r.y, r.w, r.h, 2.6);

    // V6 FAST path: at most four recognitions, with early exit on a strong result.
    const variants = [
      { canvas: roi, psm: 7, label: 'hızlı' },
      { canvas: enhance(roi, 2.15, null), psm: 7, label: 'kontrast' },
      { canvas: enhance(roi, 2.25, 142), psm: 7, label: 'eşik' },
      { canvas: enhance(roi, 1.85, null), psm: 13, label: 'tek satır' }
    ];

    const results = [];
    for (let i = 0; i < variants.length; i++) {
      if (onProgress) onProgress(Math.round((i / variants.length) * 100), `${variants[i].label} ${i+1}/${variants.length}`);
      const out = await recognize(w, variants[i].canvas, variants[i].psm);
      if (key(out.text).length >= 3) results.push(out);

      // Fast accept: a single very clean result.
      if (out.confidence >= 88 && key(out.text).length >= 4 && key(out.text).length <= 24) {
        if (onProgress) onProgress(100, 'hızlı doğrulama');
        return { text: out.text, confidence: Math.round(out.confidence), consensus: 1, candidates: [out], roiDataUrl: roi.toDataURL('image/jpeg', 0.94), version: '6.0-fast' };
      }

      // Consensus accept after two passes.
      if (results.length >= 2) {
        const a = key(results[results.length-1].text), b = key(results[results.length-2].text);
        if (a && a === b) {
          const best = results[results.length-1].score >= results[results.length-2].score ? results[results.length-1] : results[results.length-2];
          if (onProgress) onProgress(100, 'iki sonuç uyuştu');
          return { text: best.text, confidence: Math.round(best.confidence), consensus: 2, candidates: results.slice().sort((x,y)=>y.score-x.score), roiDataUrl: roi.toDataURL('image/jpeg', 0.94), version: '6.0-fast' };
        }
      }
    }

    results.sort((a,b)=>b.score-a.score);
    const chosen = results[0] || { text:'', confidence:0, score:-999 };
    if (onProgress) onProgress(100, 'tamamlandı');
    return { text: chosen.text, confidence: Math.max(0,Math.min(100,Math.round(chosen.confidence||0))), consensus: 1, candidates: results.slice(0,3), roiDataUrl: roi.toDataURL('image/jpeg',0.94), version:'6.0-fast' };
  }

  window.addEventListener('DOMContentLoaded', () => {
    const guide = document.querySelector('.cross');
    if (guide) {
      guide.style.width = '72%';
      guide.style.height = '18%';
      guide.style.borderWidth = '3px';
    }
    const label = document.querySelector('.guide');
    if (label) label.textContent = 'SADECE TABELA YAZISINI YEŞİL ŞERİDE AL';
  });

  window.TabelaOCR = { run, version:'6.0-fast' };
})();
