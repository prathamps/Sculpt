# Sculpt in action

Every capture on this page was taken from a real Sculpt instance driven end to
end in a browser — register, create a project, upload, annotate, comment — with
no mockups. To reproduce any of them, self-host Sculpt (four steps in the
[README](../README.md#quick-start-self-hosted)) and upload your own media.

## Projects and files

Projects group your media; every file card shows a live thumbnail, its review
status and how many versions it carries. Folders, bulk select, filters and
`Ctrl`/`Cmd`+`K` search keep large projects navigable.

![Project dashboard](media/dashboard.png)

![Project file grid with image, video, PDF and 3D model](media/project.png)

## Image annotation

Draw directly on the image — pencil, rectangle or line, in nine colors — and
the strokes are saved with your comment. Selecting a comment in the sidebar
highlights exactly the drawings that belong to it.

![Annotating an image and commenting](media/image-annotation.gif)

![An image comment with its two drawings selected](media/image-annotation.png)

## Video annotation

Pause on any frame and draw; the comment is anchored to that timestamp and
appears as a marker on the scrubber. Playback is frame-steppable with keyboard
shortcuts, speed control, looping and an annotated-frame PNG export. Uploads in
containers a browser cannot play (MKV, AVI, MXF, ProRes …) are transcoded to a
web-friendly rendition in the background while the original is kept.

![Drawing on a paused video frame](media/video-annotation.gif)

![A video comment anchored at 0:02 with a marker on the scrubber](media/video-annotation.png)

## 3D model review

Orbit the model and click its surface to drop a numbered pin; the comment saves
the exact camera pose, and selecting it later flies every reviewer back to that
viewpoint without reloading the model. Sixteen formats (FBX, OBJ, STL, PLY,
DAE, 3MF, USDZ, …) are converted to GLB in the browser at upload time.

![Placing a pin on a 3D model and flying back to it](media/model-annotation.gif)

![A pinned 3D comment after the camera flew to its saved view](media/model-annotation.png)

## PDF review

Page-by-page viewing with drawings and comments anchored to the page they were
made on — the sidebar can filter to the current page or show every page.

![A PDF page with a drawing anchored to a comment](media/pdf-review.png)
