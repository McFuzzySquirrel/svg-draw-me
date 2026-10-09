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

For filled rectangles, ellipses, and polygons, enable **Gradient**, choose
linear or radial mode, and choose a gradient end color before drawing. The
gradient is retained in the project model, rendered in PixiJS, and exported
through SVG gradient definitions.

Text uses the requested font family with a generic `sans-serif` fallback when
the family is unavailable in the browser or SVG consumer. Text-to-path
conversion is not performed, so exact glyph outlines depend on installed fonts.

Enable **Blur effect** for a constrained blur filter on new non-line shapes.
Use **Path** to create a vector path from pointer points. Use **Edit paths** to
select an authored or imported editable path, choose a node, and update its
command and numeric coordinates without editing project JSON directly.
Move/line, quadratic, and cubic commands are supported. Paths containing
elliptical arcs or malformed data remain in the imported reference and are
reported as read-only.

Choose **Text**, enter the content and size, then click the canvas to place a
text object. Text remains editable project data and exports as an SVG
`text` element with its font, color, alignment, and transform metadata.

Set **Canvas width** and **Canvas height** in the toolbar to resize the project. New strokes and shapes stay inside the canvas, and visible artwork and references are clipped to its edges. Importing a reference larger than the current canvas expands the canvas to show the full reference.

### Fill and clear objects

Draw a freehand loop with **Pen**, leaving the endpoints close together. Choose **Fill bucket**, choose a **Fill color**, and tap inside the loop. The bucket accepts a small endpoint gap, keeps the original stroke points and metadata, and can be undone. Tap inside an existing filled loop or a filled rectangle, ellipse, or polygon to replace its fill. Choose **No fill** or **Clear fill** before tapping to remove an existing fill. Lines, curved lines, open loops, and clicks outside a fillable object are not filled.

### Mobile menu

On a narrow screen, use **Menu** to show the controls and **Hide menu** to collapse them and give the canvas more space. The drawing remains unchanged when the menu is collapsed.

Toolbar actions use compact icons; focus or hover an icon button to see its label. Use **Show grid**/**Hide grid** to toggle the alignment grid, and set **Grid size** to change its spacing (50 units by default). The grid covers the canvas, overlays reference images, and artwork appears above both. The grid is only an editing aid and is not included in exports.

### Erase

Choose **Eraser**, then touch a stroke, shape, or reference image/SVG. The complete object or reference layer is removed and can be restored with **Undo**. The current eraser removes whole items rather than splitting a stroke into partial segments.

### Zoom and pan

- Use `+`, `−`, or **Reset zoom**.
- Use the mouse wheel over the canvas to zoom around the pointer.
- Use two fingers to pinch-zoom on touch devices.
- Select **Pan** to drag the canvas with one finger on a touch device. Two-finger pinch gestures also pan while zooming.
- Hold Space while dragging, or use the middle mouse button, to pan.
- Zoom ranges from 25% to 800%.

Zoom and pan affect the viewport only; stored stroke coordinates remain in project space.

### Trace a raster image

1. Choose **Reference image**.
2. Select a PNG or JPG.
3. The image appears as a translucent reference behind new strokes.
4. Draw over the reference. If it is larger than the canvas, the canvas expands to contain it.

The reference is kept separately from user strokes. It is not automatically vectorized.

### Import an SVG

1. Choose **Import SVG**.
2. Select an SVG file.
3. The SVG appears as a crisp vector reference layer. If it is larger than the canvas, the canvas expands to contain it.

The original SVG markup is retained in the project model for export. Filters, masks, CSS, SVG animation, and external assets are reported as
unsupported preview features and may not render identically. Original markup
is retained in the project for editable export.

### Undo and clear

- **Undo** reverses the most recently completed drawing or eraser action.
- **Clear** removes all user strokes and shapes.
- Imported reference layers are not removed by these controls.

### Export

- **Download SVG** creates a standard SVG containing visible imported layers and user stroke geometry.
- **Download editable** creates an SVG containing the geometry plus project metadata intended to preserve stroke history.

### Save and continue editing

- Choose **Save project** to download a `.svgdraw` project file containing the editable artwork and imported references.
- Choose **Open project** and select a previously saved `.svgdraw` file to restore the project and continue editing.
- Project files are local JSON data; save a new copy after making further changes. Loading a project restores its canvas dimensions and references, replaces the current canvas, and clears its undo history.

### Preview animations

Open the **Animation** panel to select a stroke, shape, or named layer and add
a predefined fade, move, scale, rotate, draw, pulse, or emphasis animation.
Set its duration, delay, iteration count, direction, and easing, then use
**Play**, **Pause**, or **Reset** to preview it. Animation state is evaluated
transiently and does not rewrite the saved geometry. The **Reduce motion**
toggle is enabled automatically when the browser requests
`prefers-reduced-motion`; it can also be changed manually.

Animation definitions are preserved in saved projects and editable SVG
metadata. **Download SVG** remains a static export.

The **Layers** panel can add, rename, reorder, hide, show, and change the
opacity of named layers. Deleting a layer moves its objects to the root and
removes animations targeting that layer.

## Offline and Reconnect Behavior

There is no network-backed account or synchronization. Once the application assets are loaded, drawing and local file processing occur in the browser. Save a `.svgdraw` project before refreshing or closing the page to continue editing later.

## Statuses and Notifications

The status line reports completed strokes, successful imports, downloads, invalid SVG input, and loading errors. Import failures include the browser/PixiJS error message when available.

### Browser smoke checklist

Before a release, verify in a supported browser that mouse and touch drawing
create separate strokes, the Pan tool responds to pinch or wheel navigation,
animation controls play and reset targets, local SVG/raster imports appear in
the reference list, and standard/editable downloads open successfully. Also
check that keyboard focus reaches the toolbar and animation controls, and
that reduced-motion preferences disable playback motion.

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

The app does not save work automatically. Use **Save project** before leaving the page, then **Open project** to continue later.

## Getting Help

Use the repository issue tracker for reproducible bugs. Include browser/OS details, file type, the exact interaction, and any status or console error. Do not attach private artwork unless you have permission.
