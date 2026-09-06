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

  function crop(img, x, y, w, h, scale = 2) {
    const c = makeCanvas(w * scale, h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  function enhance(source, threshold = false) {
    const c = makeCanvas(source.width, source.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const im = ctx.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    let mean = 0;
    for (let i = 0; i < d.length; i += 4) mean += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
    mean /= (d.length / 4);
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
      g = Math.max(0, Math.min(255, (g - mean) * 1.85 + 128));
      if (threshold) g = g > 145 ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = g;
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }

  function cleanText(s) {
    return (s || '')
      .replace(/[|_~`^]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textQuality(text, confidence) {
    const t = cleanText(text);
    if (!t) return -999;
    const chars = [...t];
    const letters = chars.filter(ch => /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(ch)).length;
    const weird = chars.filter(ch => !/[A-Za-zÇĞİÖŞÜçğıöşü0-9 .&+\-/'’]/.test(ch)).length;
    const tokens = t.split(/\s+/).filter(Boolean);
    const tiny = tokens.filter(x => x.length === 1).length;
    const alphaRatio = letters / Math.max(1, chars.length);
    let score = Number(confidence || 0) + alphaRatio * 34 - weird * 7 - tiny * 2;
    if (letters >= 4) score += 8;
    if (tokens.length > 10) score -= (tokens.length - 10) * 3;
    return score;
  }

  async function getWorker(onProgress) {
    if (worker) return worker;
    if (!window.Tesseract) throw new Error('OCR motoru yüklenemedi. İnternet bağlantısını kontrol edin.');
    worker = await Tesseract.createWorker('tur+eng', 1, {
      logger: m => {
        if (m && typeof m.progress === 'number' && onProgress) {
          onProgress(Math.round(m.progress * 100), m.status || '');
        }
      }
    });
    return worker;
  }

  async function recognizeVariant(w, canvas, psm, onProgress) {
    await w.setParameters({
      tessedit_pageseg_mode: String(psm),
      preserve_interword_spaces: '1',
      user_defined_dpi: '300'
    });
    const r = await w.recognize(canvas);
    const text = cleanText(r?.data?.text || '');
    const confidence = Number(r?.data?.confidence || 0);
    return { text, confidence, score: textQuality(text, confidence) };
  }

  async function run(photoData, onProgress) {
    const img = await loadImage(photoData);
    const w = await getWorker(onProgress);

    // The green guide is 70% x 42% and centered. OCR is restricted to that region.
    const rx = Math.round(img.width * 0.15);
    const ry = Math.round(img.height * 0.29);
    const rw = Math.round(img.width * 0.70);
    const rh = Math.round(img.height * 0.42);

    const roi = crop(img, rx, ry, rw, rh, 2);
    const stripeH = Math.round(roi.height * 0.46);
    const stripes = [
      roi,
      crop(roi, 0, Math.round(roi.height * 0.07), roi.width, stripeH, 1),
      crop(roi, 0, Math.round(roi.height * 0.27), roi.width, stripeH, 1),
      crop(roi, 0, Math.round(roi.height * 0.47), roi.width, stripeH, 1)
    ];

    const variants = [];
    for (const s of stripes) {
      variants.push(s, enhance(s, false), enhance(s, true));
    }

    const results = [];
    for (let i = 0; i < variants.length; i++) {
      if (onProgress) onProgress(Math.round((i / variants.length) * 100), `varyant ${i+1}/${variants.length}`);
      const psm = i < 3 ? 6 : 7;
      results.push(await recognizeVariant(w, variants[i], psm, onProgress));
    }

    results.sort((a, b) => b.score - a.score);
    const best = results[0] || { text:'', confidence:0, score:-999 };

    // Consensus boost: repeated normalized candidates are preferred.
    const groups = new Map();
    for (const r of results) {
      const key = r.text.toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
      if (key.length < 3) continue;
      const g = groups.get(key) || { count:0, best:r };
      g.count++;
      if (r.score > g.best.score) g.best = r;
      groups.set(key, g);
    }
    let chosen = best;
    for (const g of groups.values()) {
      if (g.count >= 2 && g.best.score + g.count * 5 > chosen.score) {
        chosen = { ...g.best, score: g.best.score + g.count * 5, consensus: g.count };
      }
    }

    return {
      text: chosen.text,
      confidence: Math.max(0, Math.min(100, Math.round(chosen.confidence || 0))),
      consensus: chosen.consensus || 1,
      candidates: results.slice(0, 5),
      roiDataUrl: roi.toDataURL('image/jpeg', 0.92)
    };
  }

  window.TabelaOCR = { run };
})();
