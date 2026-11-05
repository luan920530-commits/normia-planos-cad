/*
 * Normia nativo · ventana de macOS.
 */
#import <Cocoa/Cocoa.h>

@protocol CanvasViewDelegate;

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, CanvasViewDelegate>
@end
