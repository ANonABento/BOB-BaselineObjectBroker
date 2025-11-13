export const COIN_DIAMETER_MM = 26.5; // Canadian Loonie

export function initOpenCV({ scriptUrl = 'https://docs.opencv.org/4.7.0/opencv.js' } = {}) {
  // Return existing promise if called again
  if (window._cvInitPromise) return window._cvInitPromise;

  window._cvInitPromise = new Promise((resolve, reject) => {
    // If already loaded
    if (window.cv && window.cv.Mat) return resolve(window.cv);

    // If script tag not present, inject it
    const existing = Array.from(document.getElementsByTagName('script')).find(s => s.src && s.src.includes('opencv'));
    if (!existing) {
      const s = document.createElement('script');
      s.async = true;
      s.src = scriptUrl;
      s.onerror = () => reject(new Error('Failed to load OpenCV.js script'));
      document.head.appendChild(s);
    }

    // Wait for runtime
    const timeout = setTimeout(() => reject(new Error('OpenCV.js load timeout (30s)')), 30000);

    const onReady = () => {
      clearTimeout(timeout);
      window.cv['onRuntimeInitialized'] = window.cv['onRuntimeInitialized'] || (() => {});
      // flag
      window.cv._ready = true;
      resolve(window.cv);
    };

    // If cv becomes available later
    const poll = () => {
      if (window.cv && window.cv.Mat) return onReady();
      setTimeout(poll, 100);
    };
    poll();
  });

  return window._cvInitPromise;
}

function loadImageToMatFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mat = window.cv.matFromImageData(imageData);
      resolve({ mat, width: img.width, height: img.height });
    };
    img.onerror = (e) => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

export async function detectCoin(dataUrl, opts = {}) {
  await initOpenCV();
  const cv = window.cv;
  const { mat, width, height } = await loadImageToMatFromDataUrl(dataUrl);

  try {
    const gray = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    // Try HoughCircles with a few parameter sets
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 1.5);

    const circles = new cv.Mat();
    try {
      // param2 is accumulator threshold — try permissive value first
      cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, 1.2, 50, 100, 30, 10, Math.max(width, height));
    } catch (e) {
      // Hough sometimes unsupported in some builds
    }

    if (circles && circles.cols > 0) {
      // pick largest radius
      let best = null;
      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3];
        const y = circles.data32F[i * 3 + 1];
        const r = circles.data32F[i * 3 + 2];
        if (!best || r > best.r) best = { x, y, r };
      }
      // cleanup
      mat.delete(); gray.delete(); blurred.delete(); circles.delete();
      return best ? best.r * 2 : null; // diameter in px
    }

    // Fallback: Otsu + contour circularity
    const th = new cv.Mat();
    cv.threshold(gray, th, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(th, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestScore = 0; let bestDiameter = null;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < 500) { c.delete(); continue; }
      const per = cv.arcLength(c, true);
      if (per <= 0) { c.delete(); continue; }
      const circ = (4 * Math.PI * area) / (per * per);
      if (circ <= 0.35) { c.delete(); continue; }
      const rect = cv.minAreaRect(c);
      const dia = Math.max(rect.size.width, rect.size.height);
      const score = circ * (area / (Math.PI * (dia/2)*(dia/2)));
      if (score > bestScore) { bestScore = score; bestDiameter = dia; }
      c.delete();
    }

    mat.delete(); gray.delete(); blurred.delete(); th.delete(); contours.delete(); hierarchy.delete();
    return bestDiameter;
  } catch (e) {
    try { mat.delete(); } catch (_) {}
    throw e;
  }
}

/**
 * detectContours(dataUrl, { useRedFilter = false, coin = null })
 * returns array of objects: { id, name, color, contour:{x,y,width,height}, points:[{x,y}], edges:[{start,end,pixelLength,realLength}], area, perimeter, isCoin, circularity }
 */
export async function detectContours(dataUrl, { useRedFilter = false, coin = null } = {}) {
  await initOpenCV();
  const cv = window.cv;
  const { mat, width, height } = await loadImageToMatFromDataUrl(dataUrl);

  try {
    // Prepare mask: either color-based (red) or general threshold + CLAHE + Canny
    let mask = new cv.Mat();

    if (useRedFilter) {
      const hsv = new cv.Mat();
      cv.cvtColor(mat, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      const low1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 100, 40, 0]);
      const high1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 255, 255, 255]);
      const low2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [160, 100, 40, 0]);
      const high2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [179, 255, 255, 255]);
      const m1 = new cv.Mat(); const m2 = new cv.Mat();
      cv.inRange(hsv, low1, high1, m1);
      cv.inRange(hsv, low2, high2, m2);
      cv.bitwise_or(m1, m2, mask);
      // cleanup temporaries
      hsv.delete(); low1.delete(); high1.delete(); low2.delete(); high2.delete(); m1.delete(); m2.delete();
    } else {
      // General approach: convert to gray, CLAHE, blur, Canny
      const gray = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
      const grayEn = new cv.Mat();
      clahe.apply(gray, grayEn);
      clahe.delete(); gray.delete();
      const blurred = new cv.Mat();
      cv.GaussianBlur(grayEn, blurred, new cv.Size(5,5), 0);
      grayEn.delete();
      const edges = new cv.Mat();
      cv.Canny(blurred, edges, 30, 120);
      blurred.delete();
      // close gaps
      const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7,7));
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k);
      k.delete();
      cv.threshold(edges, mask, 10, 255, cv.THRESH_BINARY);
      edges.delete();
    }

    // Remove coin area if provided
    if (coin && coin.x != null && coin.y != null && coin.r != null) {
      cv.circle(mask, new cv.Point(coin.x, coin.y), Math.round(coin.r * 1.2), new cv.Scalar(0,0,0,0), -1);
    }

    // Morphological cleanup
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5,5));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const objects = [];
    const imageArea = width * height;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < 700 || area > imageArea * 0.8) { c.delete(); continue; }

      // Compute centroid to maybe skip coin
      const M = cv.moments(c);
      let cx = null, cy = null;
      if (M.m00 !== 0) { cx = M.m10 / M.m00; cy = M.m01 / M.m00; }
      if (coin && cx != null && cy != null) {
        const dist = Math.hypot(cx - coin.x, cy - coin.y);
        if (dist < coin.r * 1.2) { c.delete(); continue; }
      }

      const peri = cv.arcLength(c, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.015 * peri, true);
      const circularity = (4 * Math.PI * area) / (peri * peri);

      // bounding box
      const rect = cv.boundingRect(c);

      // build point list
      const points = [];
      for (let r = 0; r < approx.rows; r++) {
        points.push({ x: approx.data32S[r*2], y: approx.data32S[r*2 + 1] });
      }

      // edges
      const edgesArr = [];
      for (let p = 0; p < points.length; p++) {
        const p1 = points[p]; const p2 = points[(p+1) % points.length];
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        edgesArr.push({ start: p1, end: p2, pixelLength: len, realLength: null });
      }

      const perimeter = edgesArr.reduce((s,e) => s + e.pixelLength, 0);

      objects.push({
        id: `obj_${Date.now()}_${i}`,
        name: `Object ${objects.length + 1}`,
        color: ['#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4', '#F97316'][objects.length % 8],
        contour: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        points: points.length ? points : [{ x: rect.x, y: rect.y }, { x: rect.x+rect.width, y: rect.y }, { x: rect.x+rect.width, y: rect.y+rect.height }, { x: rect.x, y: rect.y+rect.height }],
        edges: edgesArr,
        area,
        perimeter,
        isCoin: false,
        circularity,
        pixelDistance: null,
        measurements: { edges: edgesArr.map(e => ({ pixelLength: e.pixelLength, realLength: null })), perimeter: null }
      });

      approx.delete(); c.delete();
    }

    // cleanup mats
    mat.delete(); mask.delete(); contours.delete(); hierarchy.delete();

    return objects;
  } catch (e) {
    try { mat.delete(); } catch(_) {}
    throw e;
  }
}

export function calculatePPM(pixelDiameter) {
  if (!pixelDiameter || pixelDiameter <= 0) return null;
  return pixelDiameter / COIN_DIAMETER_MM; // pixels per mm
}

export function calculatePixelDistance(p1, p2) {
  const dx = p1.x - p2.x; const dy = p1.y - p2.y; return Math.hypot(dx, dy);
}

export function applyPPMToObject(obj, ppm) {
  if (!ppm || ppm <= 0) return obj;
  const updatedEdges = (obj.edges || []).map(edge => ({ ...edge, realLength: Math.round((edge.pixelLength / ppm) * 100) / 100 }));
  const realPerimeter = obj.perimeter ? Math.round((obj.perimeter / ppm) * 100) / 100 : null;
  return { ...obj, edges: updatedEdges, measurements: { edges: updatedEdges.map(e => ({ pixelLength: e.pixelLength, realLength: e.realLength })), perimeter: realPerimeter } };
}
