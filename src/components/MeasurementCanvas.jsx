import React, { useEffect, useRef } from 'react';

export default function MeasurementCanvas({ image, objects = [], ppm = null, mode = 'select', coinPoints = [], newObjectPoints = [], onCanvasClick = ()=>{}, onMouseMove = ()=>{} }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current; const ctx = canvas.getContext('2d');

    // Fit canvas to image dimensions
    canvas.width = image.width; canvas.height = image.height;

    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0,0,canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // draw objects
      objects.forEach(obj => {
        const isCoin = obj.isCoin;
        const color = obj.color || '#3B82F6';

        // polygon path
        if (obj.points && obj.points.length) {
          ctx.beginPath(); ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i=1;i<obj.points.length;i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
          ctx.closePath();
          ctx.fillStyle = color + '40'; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = isCoin ? 3 : 2; ctx.stroke();
        } else if (obj.contour) {
          const { x,y,width,height } = obj.contour;
          ctx.fillStyle = color + '40'; ctx.fillRect(x,y,width,height);
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x,y,width,height);
        }

        // edges labels
        if (obj.edges) {
          obj.edges.forEach((edge, idx) => {
            const midX = (edge.start.x + edge.end.x)/2; const midY = (edge.start.y + edge.end.y)/2;
            const text = (ppm && edge.realLength != null) ? `${edge.realLength.toFixed(1)}mm` : `${edge.pixelLength.toFixed(0)}px`;
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#000'; ctx.fillRect(midX-30, midY-16, 60, 18);
            ctx.fillStyle = '#fff'; ctx.fillText(text, midX-25, midY-3);
          });
        }

        // name label
        const cx = obj.points && obj.points.length ? obj.points.reduce((a,p)=>a+p.x,0)/obj.points.length : (obj.contour.x + obj.contour.width/2);
        const cy = obj.points && obj.points.length ? obj.points.reduce((a,p)=>a+p.y,0)/obj.points.length : (obj.contour.y + obj.contour.height/2);
        ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = obj.color || '#fff'; ctx.fillText(obj.name, cx - 20, cy - 10);
      });

      // manual coin points
      if (mode === 'manual_coin' && coinPoints && coinPoints.length) {
        coinPoints.forEach((p, idx) => {
          ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fillStyle = '#F59E0B'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke();
        });
        if (coinPoints.length === 2) {
          const p1 = coinPoints[0], p2 = coinPoints[1];
          ctx.setLineDash([6,6]); ctx.strokeStyle = '#F59E0B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); ctx.setLineDash([]);
          const midX = (p1.x + p2.x)/2, midY = (p1.y + p2.y)/2; const dist = Math.hypot(p2.x-p1.x, p2.y-p1.y);
          ctx.fillStyle = '#fff'; ctx.fillRect(midX-30, midY-18, 60, 20); ctx.fillStyle='#000'; ctx.fillText(`${dist.toFixed(1)}px`, midX-22, midY-4);
        }
      }

      // new object in creation
      if (mode === 'create_object' && newObjectPoints && newObjectPoints.length) {
        ctx.strokeStyle = '#00FF00'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(newObjectPoints[0].x, newObjectPoints[0].y);
        for (let i=1;i<newObjectPoints.length;i++) ctx.lineTo(newObjectPoints[i].x, newObjectPoints[i].y);
        ctx.stroke();
        newObjectPoints.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fillStyle='#00FF00'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();});
      }
    };
    img.src = image.dataUrl;
  }, [image, objects, ppm, mode, coinPoints, newObjectPoints]);

  return (
    <canvas
      ref={canvasRef}
      onClick={(e)=>{
        const rect = e.target.getBoundingClientRect();
        const x = (e.clientX - rect.left); const y = (e.clientY - rect.top);
        onCanvasClick({ x, y });
      }}
      onMouseMove={(e)=>{
        const rect = e.target.getBoundingClientRect(); const x = (e.clientX - rect.left); const y = (e.clientY - rect.top);
        onMouseMove({ x,y });
      }}
      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
    />
  );
}