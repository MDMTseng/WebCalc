# WebRuler

A browser-based measurement tool that allows you to measure anything on your screen with precision.

![WebRuler Screenshot](screenshot.png)

## Features

- **Precise Measurements**: Measure distances on your screen in centimeters or millimeters
- **Screen Calibration**: Calibrate the tool to ensure accurate measurements on any display
- **Multiple Measurement Lines**: Create and manage multiple measurement lines simultaneously
- **Fullscreen Mode**: Expand to fullscreen for measuring across your entire display
- **Minimizable Measurements Panel**: Keep your measurements organized and out of the way when needed
- **Adjustable Calibration**: Fine-tune calibration with a ratio adjustment system

## Getting Started

### Running Locally (No Server Required)

1. Download the latest release from the [releases page](https://github.com/yourusername/WebRuler/releases)
2. Extract the ZIP file to a location of your choice
3. Open the `index.html` file directly in your browser

That's it! No server or installation required.

### Usage Instructions

1. **First-time Setup**: Calibrate your screen by clicking the "Calibrate" button
2. **Creating Measurements**: Click and drag anywhere on the screen to create a measurement line
3. **Managing Measurements**: View all measurements in the panel on the left side
4. **Adjusting Measurements**: Drag the endpoints of any line to adjust its position
5. **Minimizing the Panel**: Click the minimize button (−) to collapse the measurements panel
6. **Fullscreen Mode**: Click the "Fullscreen" button for a distraction-free measuring experience
7. **Resetting**: Click the "Reset" button to remove all measurement lines

## Screen Calibration

For accurate measurements, WebRuler needs to know your screen's pixel density:

1. Click the "Calibrate" button
2. The calibration modal offers a ratio-based calibration method
3. Adjust the ratio (numerator/denominator) to fine-tune your calibration
4. Click "Apply" to set the new calibration
5. The current calibration values (pixels/cm and mm/pixel) are displayed for reference

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/WebRuler.git

# Navigate to the project directory
cd WebRuler

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Building for Production

```bash
# Build the project
npm run build

# The output will be in the 'dist' directory
# You can open dist/index.html directly in a browser
```

## Technologies Used

- React
- TypeScript
- Vite
- CSS

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Inspired by the need for quick and accurate on-screen measurements
- Thanks to all contributors who have helped improve this tool

## Mobile Compatibility

WebRuler works on mobile devices with the following considerations:

- **Touch Controls**: Tap and drag to create and adjust measurement lines
- **Pinch to Zoom**: Use standard pinch gestures to zoom in/out for precise measurements
- **Orientation Support**: Works in both portrait and landscape orientations
- **Pull-to-Refresh Prevention**: The app prevents accidental page refreshes when dragging lines downward on iOS devices

### Known Issues and Fixes

- **iOS Pull-to-Refresh**: Fixed an issue where dragging horizontal lines downward would trigger the browser's pull-to-refresh action on iOS devices
- **Mobile Calibration**: For best results on mobile, calibrate the screen using a physical ruler in both portrait and landscape modes

---

Made with ❤️ by [Your Name]
