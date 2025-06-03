# The Tandy Cube - Live Virtual Performance Venue

A 3D virtual performance space with livestream integration and MP4 fallback support.

## Video Configuration

This application supports both livestream and MP4 fallback video sources for maximum reliability.

### Configuration Variables

Edit these variables in `public/index.html` (around line 620) to control video behavior:

```javascript
// Video Configuration - Edit these to control video source behavior
const USE_MP4_INSTEAD_OF_LIVESTREAM = false; // Set to true to bypass livestream and use MP4
const MP4_FALLBACK_URL = './fallback-video.mp4'; // Path to your MP4 fallback file
const LIVESTREAM_TIMEOUT = 10000; // 10 seconds timeout for livestream before falling back to MP4
```

### Setup Instructions

1. **Add your MP4 fallback file:**
   - Place your MP4 video file in the `public/` directory
   - Update `MP4_FALLBACK_URL` to point to your file (e.g., `'./my-video.mp4'`)

2. **Choose your mode:**
   - **Livestream with fallback** (default): Set `USE_MP4_INSTEAD_OF_LIVESTREAM = false`
   - **MP4 only**: Set `USE_MP4_INSTEAD_OF_LIVESTREAM = true`

3. **Adjust timeout** (optional):
   - Change `LIVESTREAM_TIMEOUT` to control how long to wait for livestream before falling back

### How It Works

#### Automatic Fallback Mode (Default)
1. Application attempts to load the livestream first
2. If livestream fails to load within the timeout period, automatically switches to MP4
3. If livestream encounters fatal errors during playback, switches to MP4
4. UI shows "LIVE" with red pulsing dot for livestream, "RECORDED" with orange dot for MP4

#### MP4 Only Mode
1. Bypasses livestream entirely
2. Loads MP4 file directly
3. MP4 video loops continuously
4. UI shows "RECORDED" status

### Visual Indicators

- **🔴 LIVE** - Livestream is active and working
- **🟠 RECORDED** - Using MP4 fallback content
- **🟠 ERROR** - Video content failed to load

### Troubleshooting

1. **MP4 won't load:**
   - Check that the file path in `MP4_FALLBACK_URL` is correct
   - Ensure the MP4 file is in the `public/` directory
   - Check browser console for error messages

2. **Livestream issues:**
   - Check browser console for HLS errors
   - Verify the livestream URL is accessible
   - Try increasing `LIVESTREAM_TIMEOUT` value

3. **Testing fallback:**
   - Set `USE_MP4_INSTEAD_OF_LIVESTREAM = true` to test MP4 playback
   - Set a very low `LIVESTREAM_TIMEOUT` (e.g., 1000) to force fallback quickly

### Browser Compatibility

- **HLS Livestream**: Supported in most modern browsers via HLS.js
- **MP4 Fallback**: Supported in all modern browsers
- **Safari**: Uses native HLS support when available

## Camera Controls

### Keyboard Controls
- WASD: Move camera (forward/back/left/right)
- Space: Move up
- Shift: Move down
- Mouse: Look around (in free-fly mode)
- C: Cycle camera modes (polar → free-fly → look-at)
- L: Toggle look-at stage mode
- F: Toggle film mode (smooth camera movement for recording)

### Gamepad Controls
- Left Stick: Move camera (forward/back/left/right with analog precision)
- Right Trigger: Move up (analog)
- Left Trigger: Move down (analog)
- Right Stick: Look around (in free-fly mode)
- Y Button: Toggle film mode
- X Button: Cycle camera modes

### Camera Modes
1. **Polar Mode**: Automatic rotation around the cube
2. **Free-fly Mode**: Full manual control with mouse look
3. **Look-at Mode**: Manual movement while always looking at the stage

### Film Mode
Film mode provides smooth, cinematic camera movement perfect for recording:
- Smooth acceleration and deceleration of camera movement
- Prevents sudden starts and stops that can be jarring in recordings
- Works with all camera modes (polar, free-fly, look-at)
- Gamepad analog inputs provide precise control over movement intensity
- Ultimate speed remains the same as normal mode, just with smoother transitions

## Features

- Real-time 3D raymarched environment
- Floating orbs with user names
- Automatic camera intro sequence
- Responsive design for mobile and desktop
- Audio fade-in system
- Performance monitoring

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open your browser and visit: `http://localhost:3001`

## Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with hot reload
- `npm test` - Run tests (placeholder)

## Project Structure

```
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── .env              # Environment variables
├── .gitignore        # Git ignore rules
├── README.md         # This file
└── public/           # Static files
    └── index.html    # Main HTML page
```

## Environment Variables

The `.env` file contains:

```env
PORT=3001
NODE_ENV=development
```

## Development

The project uses Nodemon for development, which automatically restarts the server when files change.

```bash
npm run dev
```

## Production

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Use `npm start` to run the server
3. Consider using a process manager like PM2

## Customization

- Edit `public/index.html` to customize your page
- Add more static files (CSS, JS, images) to the `public/` directory
- Modify `server.js` to add more routes as needed

## License

MIT License - feel free to use this for your projects! 