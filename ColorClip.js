/*
   ColorClip.js v1.0

   Copyright (C) 2019 Gerrit Barrere

   This program is free software: you can redistribute it and/or modify it
   under the terms of the GNU General Public License as published by the
   Free Software Foundation, version 3 of the License.

   This program is distributed in the hope that it will be useful, but WITHOUT
   ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
   FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for
   more details.

   You should have received a copy of the GNU General Public License along with
   this program.  If not, see <http://www.gnu.org/licenses/>.

   Thanks to Juan Conejero, Bob Andersson, and David Serrano for their source
   code and help.
   
   Revision history:

   v 1.0 Initial release

*/
#feature-id    Utilities > ColorClip

#feature-info  This script scans through an image and replaces pixels with any \
               component above a specified threshold with the mean of its under-threshold \
               nearest neighbors. This can be used to replace blown-out (typically \
               magenta) star cores in one-shot color images which result from debayering. \
               The blown-out core is replaced with the star color just outside the \
               blown-out region. This can be done early in the linear (pre-stretched) \
               state.  It restores dynamic range to that of the camera and gives \
               natural color to blown-out star cores.

#include <pjsr/Sizer.jsh>
#include <pjsr/FrameStyle.jsh>
#include <pjsr/StdButton.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/NumericControl.jsh>

#define VERSION "1.0"
#define TITLE   "ColorClip"

/*
 * Replace over-threshold pixels with mean of nearest under-threshold
 */
function ColorClip( image )
{
   // Gather working parameters
   var n = image.numberOfChannels;
   var w = image.width;
   var h = image.height;
   var r, g, b;
   var rn, gn, bn;

   // Create a working image copy
   var tmp = new Image( w, h, image.numberOfChannels, image.colorSpace);
   tmp.apply(image);

   // Initialize the status monitoring system for this image.
   // The status monitor will provide progress information on the console.
   image.statusEnabled = true;
   image.initializeStatus( "ColorClip", w*h );

   // Don't allow other routines to re-initialize the status monitor
   image.statusInitializationEnabled = false;

   // Reset the rectangular selection to the whole image boundary
   image.resetRectSelection();

   // Don't scan pixels on the very periphery of the image, so we can
   // read nearest neighbors without exceeding image bounds.
   
   // For each row (except first & last)
   for ( var y = 1; y < h-1; ++y )
   {
      // For each column (except first & last)
      for ( var x = 1; x < w-1; ++x )
      {
         r = tmp.sample( x, y, 0 );
         g = tmp.sample( x, y, 1 );
         b = tmp.sample( x, y, 2 );
         
         if ((r > data.clipThreshold) || 
             (g > data.clipThreshold) || 
             (b > data.clipThreshold))
         {
            // Pixel is out of range: replace with the mean of 
            // in-range neighbors.  This will almost always include 
            // as a minimum the three pixels directly above and one
            // to the left, since the algorithm scans top down and
            // left-to-right and replaces pixels as it goes.
            r = 0;
            g = 0;
            b = 0;
            var good = 0;
            
            // Read neighbors in a square immediately around the
            // out-of-range pixel
            for (var iy = -1; iy <= +1; iy++)
            {
               for (var ix = -1; ix <= +1; ix++)
               {
                  rn = tmp.sample( x+ix, y+iy, 0 );
                  gn = tmp.sample( x+ix, y+iy, 1 );
                  bn = tmp.sample( x+ix, y+iy, 2 );
                  if ((rn <= data.clipThreshold) && 
                      (gn <= data.clipThreshold) && 
                      (bn <= data.clipThreshold))
                  {
                     // Neighbor pixel is in range, include in mean
                     r += rn;
                     g += gn;
                     b += bn;
                     good++;
                  }
               }
            }
            if (good > 0)
            {
               r /= good;
               g /= good;
               b /= good;
            }
            else
            {
               // Possible to get no good neighbors if the far upper left
               // corner of the image is an over-threshold blob.  Saturate to 
               // maximum if this happens.
               r = data.clipThreshold;
               g = data.clipThreshold;
               b = data.clipThreshold;
            }
            
            // Write revised pixel to working image copy
            tmp.setSample(r, x, y, 0);
            tmp.setSample(g, x, y, 1);
            tmp.setSample(b, x, y, 2);
         }
      }
      // Update status monitoring (progress information)
      image.advanceStatus( w );
   }

   // Done processing, copy working data back to the image
   image.apply( tmp );
   tmp.free();
}

/*
 * The ColorClipData object defines functional parameters for the
 * ColorClip routine.
 */
function ColorClipData()
{
   // Get access to the active image window
   var window = ImageWindow.activeWindow;
   if ( !window.isNull )
      this.targetView = window.currentView;
   this.clipThreshold = 0.25;    // default
}

// Global ColorClip parameters.
var data = new ColorClipData;

/*
 * GUI for ColorClip.
 */
function ColorClipDialog()
{
   this.__base__ = Dialog;
   this.__base__();

   let labelWidthMax = this.font.width( "Color clip threshold: " );
   
   // Help & ID label
   this.helpLabel = new Label( this );
   this.helpLabel.frameStyle = FrameStyle_Box;
   this.helpLabel.margin = this.logicalPixelsToPhysical( 4 );
   this.helpLabel.wordWrapping = true;
   this.helpLabel.useRichText = true;
   this.helpLabel.text = "<b>" + TITLE + " v" + VERSION + "</b> &mdash; This script scans an image, " +
                         "replacing over-threshold pixels with the mean of surrounding valid pixels. " +
                         "This can be used to replace star cores blown out during debayering with the " +
                         "color just outside the blown-out core.";
   
   // Target image selector
   this.targetImage_Label = new Label( this );
   this.targetImage_Label.text = "Target image:";
   this.targetImage_Label.textAlignment = TextAlign_Left|TextAlign_VertCenter;

   this.targetImage_ViewList = new ViewList( this );
   this.targetImage_ViewList.scaledMinWidth = 300;
   this.targetImage_ViewList.getAll(); // include main views as well as previews
   this.targetImage_ViewList.currentView = data.targetView;
   this.targetImage_ViewList.toolTip = "Select the image that will have its pixels color clipped.";
   this.targetImage_ViewList.onViewSelected = function( view )
   {
      data.targetView = view;
   };

   // Color clip threshold control
   this.threshControl = new NumericControl( this );
   with (this.threshControl)
   {
      label.text = "Color clip threshold:";
      label.minWidth = labelWidthMax;
      label.textAlignment = TextAlign_Right|TextAlign_VertCenter;
      toolTip = "<p>Sets the color clip threshold level.  If any of the three image channels exceed this value on a given pixel the pixel will be replaced by the mean of its nearest in-range neighbors.</p>";
      slider.setRange(0, 1000);
      setRange( 0.01, 1.0 );
      setPrecision( 3 );
      edit.setFixedWidth( 8 * this.font.width('0') );
      setValue (data.clipThreshold);
      onValueUpdated = function( normalizedValue )
      {
         // Round to three digits right of decimal
         data.clipThreshold = Math.round(1000.0 * normalizedValue) / 1000.0;
      }
   }
   
   // Buttons
   this.ok_Button = new PushButton( this );
   this.ok_Button.text = "OK";
   this.ok_Button.icon = this.scaledResource( ":/icons/ok.png" );
   this.ok_Button.onClick = function()
   {
      this.dialog.ok();
   };

   this.cancel_Button = new PushButton( this );
   this.cancel_Button.text = "Cancel";
   this.cancel_Button.icon = this.scaledResource( ":/icons/cancel.png" );
   this.cancel_Button.onClick = function()
   {
      this.dialog.cancel();
   };

   this.buttons_Sizer = new HorizontalSizer;
   this.buttons_Sizer.spacing = 6;
   this.buttons_Sizer.addStretch();
   this.buttons_Sizer.add( this.ok_Button );
   this.buttons_Sizer.add( this.cancel_Button );

   // Overall dialog sizer & settings
   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add( this.helpLabel );
   this.sizer.addSpacing( 4 );
   this.sizer.add( this.targetImage_Label );
   this.sizer.add( this.targetImage_ViewList);
   this.sizer.add( this.threshControl);
   this.sizer.add( this.buttons_Sizer);

   this.windowTitle = TITLE + " Script";
   this.adjustToContents();
   this.setFixedSize();
   this.userResizable = false;
}

// This dialog inherits all properties and methods from the core Dialog object.
ColorClipDialog.prototype = new Dialog;

/*
 * Script entry point.
 */
function main()
{
   console.hide();

   if ( !data.targetView )
   {
      (new MessageBox( "Needs an active image window",
                       TITLE, StdIcon_Error, StdButton_Ok )).execute();
      return;
   }
   
   var dialog = new ColorClipDialog();
   
   for ( ;; )
   {
      if ( !dialog.execute() )
         break;

      // A view must be selected.
      if ( data.targetView.isNull )
      {
         (new MessageBox( "You must select a view to apply this script.",
                          TITLE, StdIcon_Error, StdButton_Ok )).execute();
         continue;
      }

      // Only configured for color images
      if ( !data.targetView.image.isColor)
      {
         (new MessageBox( "This script only works on color images",
                          TITLE, StdIcon_Error, StdButton_Ok )).execute();
         continue;
      }

      console.abortEnabled = true;
      console.show();

      var t0 = new Date;

      data.targetView.beginProcess();
      ColorClip( data.targetView.image );
      data.targetView.endProcess();

      var t1 = new Date;
      console.writeln( format( "<end><cbr>ColorClip: %.2f s", (t1.getTime() - t0.getTime())/1000 ) );
      console.writeln("ColorClip: done");

      // Quit after successful execution.
      break;
   }
}

main();
