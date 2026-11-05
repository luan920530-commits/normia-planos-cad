/*
 * Normia nativo · ventana de macOS.
 */
#import <Cocoa/Cocoa.h>

// El delegado del lienzo se declara en su cabecera: adelantarlo no basta para
// conformarse a él, y el compilador lo exige con -Werror.
#import "CanvasView.h"

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, CanvasViewDelegate>
@end
