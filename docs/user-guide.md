# User Guide

## Who This Is For

SVG Draw Me is for illustrators, hobbyists, and game-asset creators who want to draw in a browser while retaining the individual strokes that created the image.

## Before You Begin

Use a modern browser with Pointer Events enabled. A mouse works for basic drawing; a touch screen or stylus can provide touch/pen pointer metadata and pressure values when the browser exposes them.

Start the local app with:

```bash
npm install
npm run dev
```

## Sign In and First Use

There is no sign-in. The app runs locally in the browser. Draw on the white workspace or import a raster image/SVG to use as a reference.

## Main Workflows

### Draw

1. Choose a color and brush width.
2. Press and drag on the canvas.
3. Release to finish a stroke.
4. Repeat to create separate, ordered strokes.

Each completed stroke records its points, timestamps, pointer type, pressure, and style.

### Create shapes

Use the **Tool** selector to choose **Line**, **Rectangle**, **Ellipse**, **Polygon**, or **Curved line**. Drag to define the geometry; polygons collect the drag path and close when released. Shapes use the current outline color and width. Turn on **Fill shape**, then choose a **Fill color** before drawing when a filled shape is needed. Line and Curved line remain outline-only.

Shapes remain first-class objects in the editable project model and export as SVG line, rectangle, ellipse, polygon, or quadratic-path elements.

### Fill and clear objects

Draw a freehand loop with **Pen**, leaving the endpoints close together. Choose **Fill bucket**, choose a **Fill color**, and tap inside the loop. The bucket accepts a small endpoint gap, keeps the original stroke points and metadata, and can be undone. Tap inside an existing filled loop or a filled rectangle, ellipse, or polygon to replace its fill. Choose **No fill** or **Clear fill** before tapping to remove an existing fill. Lines, curved lines, open loops, and clicks outside a fillable object are not filled.

### Mobile menu

On a narrow screen, use **Menu** to show the controls and **Hide menu** to collapse them and give the canvas more space. The drawing remains unchanged when the menu is collapsed.

### Erase

Choose **Eraser**, then touch a stroke or shape. The complete object is removed and can be restored with **Undo**. The current eraser removes whole objects rather than splitting a stroke into partial segments.

### Zoom and pan

- Use `+`, `−`, or **Reset zoom**.
- Use the mouse wheel over the canvas to zoom around the pointer.
- Use two fingers to pinch-zoom on touch devices.
- Hold Space while dragging, or use the middle mouse button, to pan.
- Zoom ranges from 25% to 800%.

Zoom and pan affect the viewport only; stored stroke coordinates remain in project space.

### Trace a raster image

1. Choose **Reference image**.
2. Select a PNG or JPG.
3. The image appears as a translucent reference behind new strokes.
4. Draw over the reference.

The reference is kept separately from user strokes. It is not automatically vectorized.

### Import an SVG

1. Choose **Import SVG**.
2. Select an SVG file.
3. The SVG appears as a crisp vector reference layer.

The original SVG markup is retained in the project model for export. Complex filters, masks, CSS, or external assets may not preview identically.

### Undo and clear

- **Undo** removes the most recently completed user stroke.
- **Clear** removes all user strokes.
- Imported reference layers are not removed by these controls.

### Export

- **Download SVG** creates a standard SVG containing visible imported layers and user stroke geometry.
- **Download editable** creates an SVG containing the geometry plus project metadata intended to preserve stroke history.

## Offline and Reconnect Behavior

There is no network-backed account or synchronization. Once the application assets are loaded, drawing and local file processing occur in the browser. Refreshing or closing the page can lose unsaved in-memory work.

## Statuses and Notifications

The status line reports completed strokes, successful imports, downloads, invalid SVG input, and loading errors. Import failures include the browser/PixiJS error message when available.

## Attachments or Other Data

PNG/JPG and SVG files are read locally through browser file APIs. Raster data is stored as a data URL in the in-memory project model. Original SVG markup is stored as text. No upload endpoint is configured.

## Accessibility and Mobile Use

Toolbar actions are native HTML buttons and file inputs. The canvas has an accessible label and a status region. Touch drawing uses `touch-action: none` on the canvas host so drawing and pinch navigation can work without page scrolling over the workspace.

Keyboard focus and screen-reader coverage for the canvas drawing surface is limited; use the HTML controls for commands.

## Privacy and Data Handling

The current app does not send artwork to a server. Files and project data remain in the browser unless the user downloads or otherwise shares an exported file.

## Troubleshooting

### The stroke starts away from the cursor

Reload the latest app build. The viewport transform must use the same scale and offsets for rendering and pointer conversion.

### An SVG does not preview

Confirm the file contains an `<svg>` root element. SVG features that rely on unsupported filters, masks, CSS, external images, or browser-specific behavior may fail or render differently.

### A small image is difficult to trace

Use the zoom buttons, mouse wheel, pinch gesture, or Space/middle-mouse pan.

### Work disappeared after closing the page

The current release has no persistent project save/reopen workflow. Download an export before leaving the page.

## Getting Help

Use the repository issue tracker for reproducible bugs. Include browser/OS details, file type, the exact interaction, and any status or console error. Do not attach private artwork unless you have permission.
