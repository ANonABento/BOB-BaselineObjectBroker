# 📐 BOB - Baseline Object Broker - Measurement Tool

[![Project Status](https://img.shields.io/badge/Status-Active%20Development-blue.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME)
[![Made with React](https://img.shields.io/badge/Frontend-React%20%7C%20Vite-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![Computer Vision](https://img.shields.io/badge/Vision-OpenCV.js-FF3000?style=flat&logo=opencv&logoColor=white)](https://docs.opencv.org/4.x/d5/d10/tutorial_js_api.html)

A powerful client-side web application designed to calculate real-world dimensions of objects in an image using computer vision techniques directly in the browser.

## 💡 Core Concept

The **BOB - Measurement Tool** establishes a **Pixels Per Millimeter (PPM)** scale factor using a known reference object (a **\$1 coin** with a 26.5 mm diameter). Once calibrated, this scale is instantly applied to all other detected objects, providing accurate real-world dimensions.

---

## ✨ Key Features

### Vision & Calibration
* **Client-Side OpenCV.js:** All image processing (contour detection, measurement calculation) is performed locally in the browser for speed and efficiency.
* **Real Contour Detection:** Uses OpenCV's `findContours`, Edge Detection, and Polygon Approximation for precise object shape identification.
* **Automatic Coin Detection:** Identifies the $1 coin based on its circularity and size to set the scale factor instantly.
* **Dual Calibration Modes:** Supports **Auto-Detection** and **Manual Calibration** (clicking two points).
* **Instant Measurement:** Once the PPM is set, all perimeter and per-edge measurements are calculated and updated across all objects.

### User Interface & Interactivity
* **Contour-Based Overlays:** Overlays are accurately drawn using the actual object's shape, showing vertices and edges. Overlays scale correctly with the image view.
* **Interactive Selection:** The **`Select`** mode allows users to click contours to highlight them (with a white border) and view/edit details.
* **Manual Object Creation:** The **`Create Object`** mode allows users to click sequential vertices to define a custom polygon for measurement.
* **Labeling:** Users can assign custom names (e.g., "4x2 Brick") and colors to any selected object.

---

## ⚙️ Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/en/) (LTS version)
* npm (or Yarn/pnpm)

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/ANonABento/BOB-BaselineObjectBroker.git
    cd '.\BOB-BaselineObjectBroker\'
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
    The application will open in your browser, typically at `http://localhost:5173`.

## 🖥️ Usage Guide

1.  **Upload:** Upload an image containing your reference coin and objects. Objects will be auto-detected and labeled "Object 1," "Object 2," etc.
2.  **Calibrate:** Use either the **`🪙 Auto-Calibrate Coin`** button or the **`🖱️ Manual Calibration`** mode to set the PPM scale factor.
3.  **Measure & Label:** Switch to the **`🔍 Select`** mode to click on any object. The right-hand panel will display its calculated measurements (width, height, perimeter, and per-edge lengths).
4.  **Custom Shape:** Use the **`Create Object`** mode to define a new object shape by clicking its vertices.

## 🛠️ Built With

* **[React](https://react.dev/)**
* **[Vite](https://vitejs.dev/)**
* **[@techstark/opencv-js](https://www.npmjs.com/package/@techstark/opencv-js)**
* **[Tailwind CSS](https://tailwindcss.com/)**
