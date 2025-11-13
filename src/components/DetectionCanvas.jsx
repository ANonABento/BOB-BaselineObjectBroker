import React, { useRef, useEffect, useState } from 'react';
import { useDetection } from '../hooks/useDetectionState';

export default function DetectionCanvas() {
  const canvasRef = useRef(null);
  const { state, setManualCoinPoints, startManualObjectPoint, addManualObjectPoint, finishManualObject } = useDetection();
  const [mousePos, setMousePos] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = state.imageObject;
    if (!img) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // scale to fit
    const maxW = 1200, maxH = 800;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // helpers
    const drawCircle = (c, color = '#F59E0B') => {
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.arc(c.x * scale, c.y * scale, (c.r || c.radius || c.pixelRadius || c.pixelDistance / 2) * scale, 0, Math.PI * 2);
      ctx.stroke();
    };

    const drawPoly = (poly, color = '#3B82F6', fillAlpha = 0.25, dashed = false) => {
      if (!poly || poly.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(poly[0].x * scale, poly[0].y * scale);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x * scale, poly[i].y * scale);
      ctx.closePath();
      ctx.fillStyle = color + '40';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // draw objects
    if (state.objects && state.objects.length) {
      state.objects.forEach(obj => {
        if (obj.isCoin) {
          // draw coin circle
          if (obj.center) drawCircle({ x: obj.center.x, y: obj.center.y, r: obj.pixelDistance / 2 }, '#F59E0B');
        }
        if (obj.points && obj.points.length) {
          drawPoly(obj.points, obj.color || '#3B82F6');

          // draw edges and mm labels
          if (obj.edges && obj.edges.length) {
            obj.edges.forEach((edge, i) => {
              const midX = ((edge.start.x + edge.end.x) / 2) * scale;
              const midY = ((edge.start.y + edge.end.y) / 2) * scale;
              const text = edge.realLength ? `${edge.realLength.toFixed(1)}mm` : `${edge.pixelLength.toFixed(0)}px`;
              ctx.font = 'bold 11px sans-serif';
              const metrics = ctx.measureText(text);
              ctx.fillStyle = 'rgba(0,0,0,0.75)';
              ctx.fillRect(midX - metrics.width / 2 - 4, midY - 12, metrics.width + 8, 16);
              ctx.fillStyle = '#fff';
              ctx.fillText(text, midX - metrics.width / 2, midY + 2);
            });
          }
        } else if (obj.contour) {
          // bounding box fallback
          ctx.strokeStyle = obj.color || '#3B82F6';
          ctx.lineWidth = 2;
          ctx.strokeRect(obj.contour.x * scale, obj.contour.y * scale, obj.contour.width * scale, obj.contour.height * scale);
        }
      });
    }

    // draw manual coin points (if any)
    if (state.mode === 'manual_coin' && state.manualCoinPoints.length) {
      state.manualCoinPoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.fillStyle = '#F59E0B';
        ctx.arc(p.x * scale, p.y * scale, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      if (state.manualCoinPoints.length === 2) {
        const p1 = state.manualCoinPoints[0];
        const p2 = state.manualCoinPoints[1];
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(p1.x * scale, p1.y * scale);
        ctx.lineTo(p2.x * scale, p2.y * scale);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // draw manual object points while creating
    if (state.mode === 'create_object' && state.creatingPoints.length) {
      // solid lines for committed segments
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(state.creatingPoints[0].x * scale, state.creatingPoints[0].y * scale);
      for (let i = 1; i < state.creatingPoints.length; i++) {
        ctx.lineTo(state.creatingPoints[i].x * scale, state.creatingPoints[i].y * scale);
      }
      ctx.stroke();

      // dotted line to mouse
      if (mousePos) {
        const last = state.creatingPoints[state.creatingPoints.length - 1];
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(last.x * scale, last.y * scale);
        ctx.lineTo(mousePos.x * scale, mousePos.y * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // draw points
      state.creatingPoints.forEach(p => {
        ctx.beginPath();
        ctx.fillStyle = '#10B981';
        ctx.arc(p.x * scale, p.y * scale, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

  }, [state, mousePos]);

  // click handler
  const handleClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const imgScale = canvas.width / canvasRef.current.width || 1; // not used directly
    const x = (e.clientX - rect.left) * scale; // canvas coords
    const y = (e.clientY - rect.top) * scale;
    // convert back to image-space (we drew image scaled by factor = canvas.width / image.width)
    const img = state.imageObject;
    const invScale = canvas.width / img.width;
    const ix = x / invScale;
    const iy = y / invScale;

    if (state.mode === 'manual_coin') {
      setManualCoinPoints({ x: ix, y: iy });
    } else if (state.mode === 'create_object') {
      addManualObjectPoint({ x: ix, y: iy });
    } else {
      // select object on click (simple centroid check)
      // delegate to hook (could implement point-in-poly there)
    }
  };

  return (
    <div>
      <div className="border-2 border-gray-600 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const scale = canvas.width / rect.width;
            const x = (e.clientX - rect.left) * scale;
            const y = (e.clientY - rect.top) * scale;
            const img = state.imageObject;
            if (!img) return setMousePos(null);
            const invScale = canvas.width / img.width;
            setMousePos({ x: x / invScale, y: y / invScale });
          }}
          onMouseLeave={() => setMousePos(null)}
          style={{ width: '100%', height: 'auto', background: '#111' }}
        />
      </div>

      <div className="mt-2 text-sm text-gray-400">
        {state.mode === 'create_object' && 'Click vertices to create a new object. Click near the first point to finish.'}
      </div>
    </div>
  );
}