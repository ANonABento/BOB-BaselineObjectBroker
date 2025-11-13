import { useState, useRef, useEffect } from 'react';
import { 
  detectContours, 
  detectCoin,
  calculatePPM, 
  calculatePixelDistance,
  applyPPMToObject,
  COIN_DIAMETER_MM
} from './opencvUtils';

// Color palette for objects
const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
];

function App() {
  // State management
  const [mode, setMode] = useState('select'); // 'select', 'auto_coin', 'manual_coin', 'create_object'
  const [ppm, setPpm] = useState(null);
  const [coinDiameter, setCoinDiameter] = useState(null); // Store coin diameter in pixels
  const [imageSrc, setImageSrc] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [objects, setObjects] = useState([]);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [coinPoints, setCoinPoints] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const [newObjectPoints, setNewObjectPoints] = useState([]); // For manual object creation
  const [nextObjectId, setNextObjectId] = useState(1);
  const [mousePosition, setMousePosition] = useState(null); // For polygon builder preview
  const [detectionStats, setDetectionStats] = useState(null); // Store detection info

  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const fileInputRef = useRef(null);

  // Handle image upload
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setImageSrc(dataUrl);
      
      const img = new Image();
      img.onload = async () => {
        setImageDimensions({ width: img.width, height: img.height });
        imageRef.current = img;
        
        // Real contour detection with OpenCV
        setIsProcessing(true);
        try {
          console.log('Starting contour detection...');
          const detectedObjects = await detectContours(dataUrl);
          console.log('Contour detection completed, found', detectedObjects.length, 'objects');
          
          setDetectionStats({
            totalFound: detectedObjects.length,
            coins: detectedObjects.filter(o => o.isCoin).length,
            objects: detectedObjects.filter(o => !o.isCoin).length
          });
          
          // Objects already have unique IDs from detectContours
          // Apply PPM if already calibrated
          const finalObjects = ppm 
            ? detectedObjects.map(obj => applyPPMToObject(obj, ppm))
            : detectedObjects;
          
          setObjects(finalObjects);
          
          // Set nextObjectId based on non-coin objects
          const maxObjectNum = detectedObjects
            .filter(obj => !obj.isCoin)
            .reduce((max, obj) => {
              const match = obj.name.match(/Object (\d+)/);
              return match ? Math.max(max, parseInt(match[1])) : max;
            }, 0);
          setNextObjectId(maxObjectNum + 1);
        } catch (error) {
          console.error('Detection failed:', error);
          alert('Failed to detect objects. Please try another image.\n\nError: ' + (error.message || error.toString()));
        } finally {
          setIsProcessing(false);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Auto detect coin calibration
  const handleAutoCalibrate = async () => {
    if (!imageSrc) return;
    
    setIsProcessing(true);
    try {
      const pixelDistance = await detectCoin(imageSrc);
      const calculatedPpm = calculatePPM(pixelDistance);
      setPpm(calculatedPpm);
      setCoinDiameter(pixelDistance);
      
      // Create or update coin object
      const coinObject = {
        id: `coin_${Date.now()}`,
        name: 'Coin (Reference)',
        color: '#F59E0B',
        contour: { x: 0, y: 0, width: pixelDistance, height: pixelDistance },
        points: [],
        edges: [],
        area: Math.PI * (pixelDistance / 2) ** 2,
        perimeter: COIN_DIAMETER_MM * Math.PI,
        isCoin: true,
        circularity: 1.0,
        pixelDistance,
        measurements: {
          edges: [],
          perimeter: COIN_DIAMETER_MM * Math.PI,
          diameter: COIN_DIAMETER_MM
        }
      };
      
      // Apply PPM to all existing objects and add coin
      setObjects(prevObjects => {
        const nonCoins = prevObjects.filter(obj => !obj.isCoin);
        const calibratedObjects = nonCoins.map(obj => applyPPMToObject(obj, calculatedPpm));
        return [coinObject, ...calibratedObjects];
      });
      
      setMode('select');
    } catch (error) {
      console.error('Auto calibration failed:', error);
      alert('Failed to detect coin automatically.\n\nTips:\n• Use a plain, contrasting background\n• Ensure good lighting without harsh shadows\n• Make sure the coin is fully visible\n• Try manual calibration instead');
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual coin calibration - handle canvas clicks
  const handleCanvasClick = (event) => {
    if (!imageSrc || !imageRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const img = imageRef.current;
    
    // Calculate the actual scale used to draw the image
    const maxWidth = 1200;
    const maxHeight = 800;
    const imageScale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    
    // Calculate scale factor between displayed canvas size and actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Convert click coordinates to canvas coordinates, then to image coordinates
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;
    
    // Convert from scaled canvas coordinates to original image coordinates
    const x = canvasX / imageScale;
    const y = canvasY / imageScale;

    if (mode === 'manual_coin') {
      const newPoints = [...coinPoints, { x, y }];
      setCoinPoints(newPoints);

      if (newPoints.length === 2) {
        const pixelDistance = calculatePixelDistance(newPoints[0], newPoints[1]);
        const calculatedPpm = calculatePPM(pixelDistance);
        setPpm(calculatedPpm);
        setCoinDiameter(pixelDistance);
        
        // Create coin object for manual calibration
        const coinObject = {
          id: `coin_${Date.now()}`,
          name: 'Coin (Reference)',
          color: '#F59E0B',
          contour: { x: 0, y: 0, width: pixelDistance, height: pixelDistance },
          points: [],
          edges: [],
          area: Math.PI * (pixelDistance / 2) ** 2,
          perimeter: COIN_DIAMETER_MM * Math.PI,
          isCoin: true,
          circularity: 1.0,
          pixelDistance,
          measurements: {
            edges: [],
            perimeter: COIN_DIAMETER_MM * Math.PI,
            diameter: COIN_DIAMETER_MM
          }
        };
        
        // Apply PPM to all existing objects and add coin
        setObjects(prevObjects => {
          const nonCoins = prevObjects.filter(obj => !obj.isCoin);
          const calibratedObjects = nonCoins.map(obj => applyPPMToObject(obj, calculatedPpm));
          return [coinObject, ...calibratedObjects];
        });
        
        setCoinPoints([]);
        setMode('select');
      }
    } else if (mode === 'create_object') {
      // Add point to new object
      const newPoints = [...newObjectPoints, { x, y }];
      setNewObjectPoints(newPoints);
      
      // If user clicks near the first point (within 10px), close the polygon
      if (newPoints.length > 2) {
        const firstPoint = newPoints[0];
        const dist = calculatePixelDistance({ x, y }, firstPoint);
        if (dist < 10) {
          finishCreatingObject(newPoints.slice(0, -1)); // Remove the last duplicate point
        }
      }
    } else if (mode === 'select') {
      // Find clicked object by checking if point is inside contour
      const clickedObject = objects.find(obj => {
        if (obj.points && obj.points.length > 0) {
          // Point-in-polygon test
          return isPointInPolygon({ x, y }, obj.points);
        } else {
          // Fallback to bounding box
          const { x: ox, y: oy, width, height } = obj.contour;
          return x >= ox && x <= ox + width && y >= oy && y <= oy + height;
        }
      });
      
      if (clickedObject) {
        setSelectedObjectId(clickedObject.id);
      } else {
        setSelectedObjectId(null);
      }
    }
  };

  // Finish creating a new object from points
  const finishCreatingObject = (points) => {
    if (points.length < 3) {
      alert('At least 3 points are needed to create an object');
      setNewObjectPoints([]);
      return;
    }

    // Calculate bounding box
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Calculate edges
    const edges = [];
    let totalPerimeter = 0;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const length = calculatePixelDistance(p1, p2);
      totalPerimeter += length;
      edges.push({
        start: p1,
        end: p2,
        pixelLength: length,
        realLength: null
      });
    }

    // Calculate area using shoelace formula
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;

    // Calculate next object number (excluding coins)
    const nonCoinObjects = objects.filter(obj => !obj.isCoin);
    const nextObjectNumber = nonCoinObjects.length + 1;
    
    const newObject = {
      id: `manual_${Date.now()}_${nextObjectId}`, // Unique ID
      name: `Object ${nextObjectNumber}`,
      color: COLORS[(nextObjectNumber - 1) % COLORS.length],
      contour: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      points: points,
      edges: edges,
      area: area,
      perimeter: totalPerimeter,
      isCoin: false,
      pixelDistance: null,
      measurements: {
        edges: edges.map(e => ({ pixelLength: e.pixelLength, realLength: null })),
        perimeter: null
      }
    };

    // Apply PPM if available
    const finalObject = ppm ? applyPPMToObject(newObject, ppm) : newObject;

    setObjects(prev => {
      const updated = [...prev, finalObject];
      return updated;
    });
    setNextObjectId(prev => prev + 1);
    setNewObjectPoints([]);
    setMode('select');
    setSelectedObjectId(finalObject.id);
  };

  // Point-in-polygon test
  const isPointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Update object name
  const handleNameChange = (id, newName) => {
    setObjects(prevObjects =>
      prevObjects.map(obj =>
        obj.id === id ? { ...obj, name: newName } : obj
      )
    );
  };

  // Update object color
  const handleColorChange = (id, newColor) => {
    setObjects(prevObjects =>
      prevObjects.map(obj =>
        obj.id === id ? { ...obj, color: newColor } : obj
      )
    );
  };

  // Delete object
  const handleDeleteObject = (id) => {
    if (window.confirm('Are you sure you want to delete this object?')) {
      setObjects(prevObjects => prevObjects.filter(obj => obj.id !== id));
      if (selectedObjectId === id) {
        setSelectedObjectId(null);
      }
    }
  };

  // Apply PPM to all objects when PPM changes
  useEffect(() => {
    if (ppm && objects.length > 0) {
      setObjects(prevObjects => 
        prevObjects.map(obj => applyPPMToObject(obj, ppm))
      );
    }
  }, [ppm]);

  // Draw canvas with image and overlays
  useEffect(() => {
    if (!imageSrc || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Calculate scale to fit canvas
    const maxWidth = 1200;
    const maxHeight = 800;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    setCanvasScale(scale);

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw objects with actual contours
    objects.forEach(obj => {
      const isSelected = obj.id === selectedObjectId;
      
      if (obj.points && obj.points.length > 0) {
        // Draw actual contour shape
        ctx.beginPath();
        const firstPoint = obj.points[0];
        ctx.moveTo(firstPoint.x * scale, firstPoint.y * scale);
        
        for (let i = 1; i < obj.points.length; i++) {
          ctx.lineTo(obj.points[i].x * scale, obj.points[i].y * scale);
        }
        ctx.closePath();

        // Fill with semi-transparent color
        ctx.fillStyle = obj.color + '40';
        ctx.fill();

        // Draw border
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Draw vertices
        obj.points.forEach((point, idx) => {
          ctx.fillStyle = obj.color;
          ctx.beginPath();
          ctx.arc(point.x * scale, point.y * scale, isSelected ? 5 : 3, 0, 2 * Math.PI);
          ctx.fill();
        });

        // Draw edge measurements and labels
        if (obj.edges) {
          obj.edges.forEach((edge, idx) => {
            const midX = ((edge.start.x + edge.end.x) / 2) * scale;
            const midY = ((edge.start.y + edge.end.y) / 2) * scale;
            
            // Calculate angle for label positioning
            const dx = edge.end.x - edge.start.x;
            const dy = edge.end.y - edge.start.y;
            const angle = Math.atan2(dy, dx);
            
            // Build text with mm preferred, px as fallback
            let text;
            if (ppm && edge.realLength !== null && edge.realLength !== undefined) {
              text = `E${idx + 1}: ${edge.realLength.toFixed(1)}mm`;
            } else {
              text = `E${idx + 1}: ${edge.pixelLength.toFixed(1)}px`;
            }
            
            ctx.font = 'bold 10px sans-serif';
            const metrics = ctx.measureText(text);
            const textWidth = metrics.width;
            const textHeight = 12;
            
            // Offset label perpendicular to edge
            const offset = 15;
            const labelX = midX + Math.cos(angle + Math.PI / 2) * offset;
            const labelY = midY + Math.sin(angle + Math.PI / 2) * offset;
            
            // Draw text background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(labelX - textWidth / 2 - 3, labelY - textHeight - 3, textWidth + 6, textHeight + 6);
            
            // Draw text
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(text, labelX - textWidth / 2, labelY - 2);
          });
        }

        // Highlight selected
        if (isSelected) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      } else {
        // Fallback to bounding box
        const { x, y, width, height } = obj.contour;
        ctx.fillStyle = obj.color + '40';
        ctx.fillRect(x * scale, y * scale, width * scale, height * scale);
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeRect(x * scale, y * scale, width * scale, height * scale);
      }

      // Draw label in center of object
      let centerX, centerY;
      if (obj.points && obj.points.length > 0) {
        // Calculate centroid of polygon
        let sumX = 0, sumY = 0;
        obj.points.forEach(p => {
          sumX += p.x;
          sumY += p.y;
        });
        centerX = (sumX / obj.points.length) * scale;
        centerY = (sumY / obj.points.length) * scale;
      } else {
        // Use center of bounding box
        centerX = (obj.contour.x + obj.contour.width / 2) * scale;
        centerY = (obj.contour.y + obj.contour.height / 2) * scale;
      }
      
      ctx.font = 'bold 14px sans-serif';
      const nameMetrics = ctx.measureText(obj.name);
      const nameWidth = nameMetrics.width;
      const nameHeight = 16;
      
      // Draw text background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(centerX - nameWidth / 2 - 4, centerY - nameHeight / 2 - 2, nameWidth + 8, nameHeight + 4);
      
      // Draw text
      ctx.fillStyle = obj.color;
      ctx.fillText(obj.name, centerX - nameWidth / 2, centerY + 5);
    });

    // Draw manual coin calibration line
    if (mode === 'manual_coin' && coinPoints.length > 0) {
      coinPoints.forEach((point, index) => {
        const x = point.x * scale;
        const y = point.y * scale;
        
        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        if (coinPoints.length === 2 && index === 0) {
          const point2 = coinPoints[1];
          const x2 = point2.x * scale;
          const y2 = point2.y * scale;
          
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
          
          const midX = (x + x2) / 2;
          const midY = (y + y2) / 2;
          const distance = calculatePixelDistance(point, point2);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(`${distance.toFixed(1)}px`, midX + 10, midY - 10);
        }
      });
    }

    // Draw new object points being created
    if (mode === 'create_object' && newObjectPoints.length > 0) {
      // Draw solid lines for completed segments
      if (newObjectPoints.length > 1) {
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(newObjectPoints[0].x * scale, newObjectPoints[0].y * scale);
        for (let i = 1; i < newObjectPoints.length; i++) {
          ctx.lineTo(newObjectPoints[i].x * scale, newObjectPoints[i].y * scale);
        }
        ctx.stroke();
      }
      
      // Draw dotted line from last point to mouse position
      if (mousePosition) {
        const lastPoint = newObjectPoints[newObjectPoints.length - 1];
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(lastPoint.x * scale, lastPoint.y * scale);
        ctx.lineTo(mousePosition.x * scale, mousePosition.y * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw all points
      newObjectPoints.forEach((point, index) => {
        const x = point.x * scale;
        const y = point.y * scale;
        
        // Draw point
        ctx.fillStyle = '#00FF00';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [imageSrc, objects, selectedObjectId, coinPoints, mode, canvasScale, newObjectPoints, ppm, mousePosition]);

  const selectedObject = objects.find(obj => obj.id === selectedObjectId);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">BOB - Baseline Object Broker - Measurement Tool</h1>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
            >
              Upload Image
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Panel - Image/Canvas */}
        <div className="flex-1 p-4 overflow-auto bg-gray-800">
          <div className="flex flex-col items-center">
            {!imageSrc ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-xl mb-4">Upload an image to get started</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                  >
                    Choose Image
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Mode Toggle Buttons */}
                <div className="mb-4 flex gap-2 flex-wrap justify-center">
                  <button
                    onClick={() => {
                      setMode('select');
                      setNewObjectPoints([]);
                      setCoinPoints([]);
                    }}
                    className={`px-4 py-2 rounded-lg transition ${
                      mode === 'select'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Select
                  </button>
                  <button
                    onClick={handleAutoCalibrate}
                    disabled={isProcessing}
                    className={`px-4 py-2 rounded-lg transition ${
                      isProcessing
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600'
                    } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isProcessing ? 'Processing...' : 'Auto Detect Coin'}
                  </button>
                  <button
                    onClick={() => {
                      setMode('manual_coin');
                      setCoinPoints([]);
                      setNewObjectPoints([]);
                    }}
                    className={`px-4 py-2 rounded-lg transition ${
                      mode === 'manual_coin'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Manual Coin Calibration
                  </button>
                  <button
                    onClick={() => {
                      setMode('create_object');
                      setNewObjectPoints([]);
                      setCoinPoints([]);
                    }}
                    className={`px-4 py-2 rounded-lg transition ${
                      mode === 'create_object'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    Create Object
                  </button>
                  {mode === 'create_object' && newObjectPoints.length > 0 && (
                    <button
                      onClick={() => finishCreatingObject(newObjectPoints)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition"
                    >
                      Finish ({newObjectPoints.length} points)
                    </button>
                  )}
                </div>

                {/* Canvas */}
                <div className="border-2 border-gray-600 rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    onMouseMove={(e) => {
                      if (mode === 'create_object' && imageRef.current) {
                        const canvas = canvasRef.current;
                        const rect = canvas.getBoundingClientRect();
                        const img = imageRef.current;
                        const maxWidth = 1200;
                        const maxHeight = 800;
                        const imageScale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;
                        const canvasX = (e.clientX - rect.left) * scaleX;
                        const canvasY = (e.clientY - rect.top) * scaleY;
                        const x = canvasX / imageScale;
                        const y = canvasY / imageScale;
                        setMousePosition({ x, y });
                      } else {
                        setMousePosition(null);
                      }
                    }}
                    onMouseLeave={() => setMousePosition(null)}
                    className={`bg-gray-900 ${
                      mode === 'manual_coin' || mode === 'create_object' ? 'cursor-crosshair' : 
                      mode === 'select' ? 'cursor-pointer' : 
                      'cursor-default'
                    }`}
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </div>

                {/* Mode Instructions */}
                <div className="mt-4 text-sm text-gray-400 text-center">
                  {mode === 'select' && 'Click on objects to select them'}
                  {mode === 'auto_coin' && 'Click "Auto Detect Coin" to automatically calibrate'}
                  {mode === 'manual_coin' && 'Click two points on the coin edge to measure its diameter'}
                  {mode === 'create_object' && 'Click vertices to create a new object. Click near the first point to finish.'}
                </div>

                {ppm && (
                  <div className="mt-2 px-4 py-2 bg-green-900/50 border border-green-700 rounded-lg text-green-400">
                    <div className="font-semibold">✓ Calibrated</div>
                    <div className="text-sm mt-1">
                      {ppm.toFixed(2)} pixels/mm
                    </div>
                    {coinDiameter && (
                      <div className="text-xs mt-1 text-green-300">
                        Coin: {coinDiameter.toFixed(1)}px = {COIN_DIAMETER_MM}mm
                      </div>
                    )}
                  </div>
                )}

                {isProcessing && (
                  <div className="mt-2 px-4 py-2 bg-blue-900/50 border border-blue-700 rounded-lg text-blue-400">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                      <span>Processing image...</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Controls/Data */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Objects</h2>

          {objects.length === 0 ? (
            <p className="text-gray-400">No objects detected yet. Upload an image to begin.</p>
          ) : (
            <div className="space-y-2">
              {objects.map(obj => (
                <div
                  key={obj.id}
                  onClick={() => setSelectedObjectId(obj.id)}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                    obj.id === selectedObjectId
                      ? 'border-blue-500 bg-blue-900/30'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded flex-shrink-0"
                        style={{ backgroundColor: obj.color }}
                      />
                      <span className="font-semibold text-sm">{obj.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteObject(obj.id);
                      }}
                      className="text-red-400 hover:text-red-300 text-lg px-2 py-0 leading-none"
                      title="Delete object"
                    >
                      ×
                    </button>
                  </div>
                  <div className="text-xs text-gray-400">
                    {obj.edges && obj.edges.length > 0 ? (
                      <span>{obj.edges.length} edge{obj.edges.length !== 1 ? 's' : ''}</span>
                    ) : (
                      <span>No edges</span>
                    )}
                    {obj.circularity && (
                      <span className="ml-2">• Circ: {obj.circularity.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Object Details */}
          {selectedObject && (
            <div className="mt-6 p-4 bg-gray-700 rounded-lg">
              <h3 className="text-lg font-bold mb-3">Edit Object</h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedObject.name}
                    onChange={(e) => handleNameChange(selectedObject.id, e.target.value)}
                    className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Color</label>
                  <input
                    type="color"
                    value={selectedObject.color}
                    onChange={(e) => handleColorChange(selectedObject.id, e.target.value)}
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>

                {selectedObject.edges && selectedObject.edges.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Edge Measurements</label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedObject.edges.map((edge, idx) => (
                        <div key={idx} className="text-sm bg-gray-600 p-2 rounded">
                          <div className="flex justify-between items-center">
                            <span>Edge {idx + 1}:</span>
                            <span className="font-mono text-right">
                              {ppm && edge.realLength !== null && edge.realLength !== undefined ? (
                                <span>
                                  <span className="text-green-400">{edge.realLength.toFixed(1)}mm</span>
                                  <span className="text-gray-400 text-xs ml-1">({edge.pixelLength.toFixed(0)}px)</span>
                                </span>
                              ) : (
                                <span>{edge.pixelLength.toFixed(1)}px</span>
                              )}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedObject.measurements?.diameter && (
                  <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700 rounded text-sm">
                    <div className="text-yellow-400 font-semibold">Reference Coin</div>
                    <div className="text-yellow-300 text-xs mt-1">
                      Diameter: {selectedObject.measurements.diameter}mm
                    </div>
                  </div>
                )}

                <button
                  onClick={() => handleDeleteObject(selectedObject.id)}
                  className="w-full mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition text-white font-medium"
                >
                  Delete Object
                </button>

                {!ppm && (
                  <div className="text-yellow-400 text-sm mt-2">
                    Tip: Calibrate using the coin to enable real-world measurements
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
