let isLoaded = false;

export async function loadOpenCV() {
  if (isLoaded) return true;

  return new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) {
      isLoaded = true;
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    document.body.appendChild(script);

    const timeout = setTimeout(() => {
      reject(new Error('OpenCV.js load timeout (30s)'));
    }, 30000);

    script.onload = () => {
      window.cv['onRuntimeInitialized'] = () => {
        clearTimeout(timeout);
        isLoaded = true;
        resolve(true);
      };
    };

    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load OpenCV.js'));
    };
  });
}