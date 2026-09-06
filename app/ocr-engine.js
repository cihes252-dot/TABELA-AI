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

  function crop(img, x, y, w, h, scale = 2.5) {
    const c = makeCanvas(w * scale, h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }

  function grayscaleContrast(source, contrast = 2.0, threshold = null, invert = false) {
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
      g = Math.max(0, Math.min(255, (g - mean) * contrast + 128));
      if (threshold !== null) g = g > threshold ? 255 : 0;
      if (invert) g = 255 - g;
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
    const singles = tokens.filter(x => /^[A-Za-zÇĞİÖŞÜçğıöşü0-9]$/.test(x)).length;
    const short = tokens.filter(x => /^[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,2}$/.test(x)).length;
    if ((singles / tokens.length >= 0.55 || short / tokens.length >= 0.75) && tokens.join('').length <= 28) {
      return tokens.join('');
    }
    return t;
  }

  function textQuality(text, confidence) {
    const t = normalizeSpacedLetters(text);
    if (!t) return -999;
    const chars = [...t];
    const letters = chars.filter(ch => /[A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(ch)).length;
    const weird = chars.filter(ch => !/[A-Za-zÇĞİÖŞÜçğıöşü0-9 .&+\-/'’]/.test(ch)).length;
    const tokens = t.split(/\s+/).filter(Boolean);
    const alphaRatio = letters / Math.max(1, chars.length);
    let score = Number(confidence || 0) + alphaRatio * 42 - weird * 10;
    if (letters >= 5 && letters <= 24) score += 14;
    if (tokens.length <= 4) score += 6;
    if (tokens.length > 8) score -= (tokens.length - 8) * 5;
    if (/^[A-ZÇĞİÖŞÜ0-9&+\- ]{4,28}$/.test(t.toLocaleUpperCase('tr-TR'))) score += 8;
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
    const raw = cleanText(r?.data?.text || '');
    const text = normalizeSpacedLetters(raw);
    const confidence = Number(r?.data?.confidence || 0);
    return { text, raw, confidence, score: textQuality(text, confidence) };
  }

  function normalizedKey(text) {
    return (text || '').toLocaleUpperCase('tr-TR').replace(/[^A-ZÇĞİÖŞÜ0-9]/g, '');
  }

  async function run(photoData, onProgress) {
    const img = await loadImage(photoData);
    const w = await getWorker(onProgress);

    // V5: the visible green guide is a narrow text band, not the whole sign/photo.
    // This deliberately excludes surrounding web page, facade, people and structural lines.
    const rx = Math.round(img.width * 0.14);
    const ry = Math.round(img.height * 0.39);
    const rw = Math.round(img.width * 0.72);
    const rh = Math.round(img.height * 0.22);
    const roi = crop(img, rx, ry, rw, rh, 3);

    // Build several narrow horizontal bands around the centre because most facade signs are single-line text.
    const bands = [roi];
    const bandDefs = [
      [0.08, 0.84],
      [0.18, 0.64],
      [0.27, 0.48],
      [0.34, 0.34]
    ];
    for (const [yFrac, hFrac] of bandDefs) {
      bands.push(crop(roi, 0, Math.round(roi.height*yFrac), roi.width, Math.round(roi.height*hFrac), 1.2));
    }

    const variants = [];
    for (const b of bands) {
      variants.push({canvas:b, psm:7});
      variants.push({canvas:grayscaleContrast(b, 2.15, null, false), psm:7});
      variants.push({canvas:grayscaleContrast(b, 2.25, 130, false), psm:7});
      variants.push({canvas:grayscaleContrast(b, 2.25, 155, false), psm:7});
      variants.push({canvas:grayscaleContrast(b, 2.15, 145, true), psm:7});
      variants.push({canvas:b, psm:13});
    }

    const results = [];
    for (let i = 0; i < variants.length; i++) {
      if (onProgress) onProgress(Math.round((i / variants.length) * 100), `yazı varyantı ${i+1}/${variants.length}`);
      const r = await recognizeVariant(w, variants[i].canvas, variants[i].psm, onProgress);
      if (normalizedKey(r.text).length >= 3) results.push(r);
    }

    results.sort((a, b) => b.score - a.score);
    const best = results[0] || { text:'', confidence:0, score:-999 };

    // Consensus: exact/near repeated candidates receive a strong preference.
    const groups = new Map();
    for (const r of results) {
      const key = normalizedKey(r.text);
      if (key.length < 3) continue;
      const g = groups.get(key) || { count:0, best:r };
      g.count++;
      if (r.score > g.best.score) g.best = r;
      groups.set(key, g);
    }
    let chosen = best;
    let chosenConsensus = 1;
    for (const g of groups.values()) {
      const boosted = g.best.score + Math.min(30, g.count * 7);
      if (g.count >= 2 && boosted > chosen.score) {
        chosen = { ...g.best, score: boosted };
        chosenConsensus = g.count;
      }
    }

    // Confidence shown to the user is still OCR confidence; consensus only helps selection.
    return {
      text: chosen.text,
      confidence: Math.max(0, Math.min(100, Math.round(chosen.confidence || 0))),
      consensus: chosenConsensus,
      candidates: results.slice(0, 6),
      roiDataUrl: roi.toDataURL('image/jpeg', 0.94),
      version: '5.0'
    };
  }

  // Keep the visual guide exactly aligned with the V5 OCR crop.
  window.addEventListener('DOMContentLoaded', () => {
    const guide = document.querySelector('.cross');
    if (guide) {
      guide.style.width = '72%';
      guide.style.height = '22%';
      guide.style.borderWidth = '3px';
    }
    const label = document.querySelector('.guide');
    if (label) label.textContent = 'YAZIYI YEŞİL ŞERİDİN İÇİNE AL';
  });

  window.TabelaOCR = { run, version:'5.0' };
})();
