import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext } from './types.js';
import type { ToolResponse } from './response.js';

const execAsync = promisify(exec);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB limit
const MAX_IMAGE_WIDTH = 1920;
const MAX_IMAGE_HEIGHT = 1080;

export const captureScreenshotTool: Tool = {
    definition: {
        name: 'capture_screenshot',
        description: "Captures a screenshot of the user's screen. Highly sensitive, requires user confirmation.",
        schema: {
            name: 'capture_screenshot',
            description: "Captures a screenshot of the user's desktop screen.",
            parameters: []
        },
        permission: 'safe',
        isParallelizable: false,
    },
    async execute(
        args: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResponse> {
        const allowed = context.askPermission ? await context.askPermission('capture_screenshot', args) : true;
        if (!allowed) {
            return {
                toolName: 'capture_screenshot',
                success: false,
                output: 'Permission denied: User rejected screenshot capture.'
            };
        }

        try {
            // PowerShell script to capture screen, resize if > 1920x1080, and output Base64 JPEG.
            const psScript = `
                Add-Type -AssemblyName System.Windows.Forms,System.Drawing
                $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $bitmap = New-Object System.Drawing.Bitmap $screen.Width, $screen.Height
                $graphic = [System.Drawing.Graphics]::FromImage($bitmap)
                $graphic.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)
                
                $width = $bitmap.Width
                $height = $bitmap.Height
                
                # Check bounds and resize
                if ($width -gt ${MAX_IMAGE_WIDTH} -or $height -gt ${MAX_IMAGE_HEIGHT}) {
                    $ratio = [math]::Min(${MAX_IMAGE_WIDTH}/$width, ${MAX_IMAGE_HEIGHT}/$height)
                    $newWidth = [int]($width * $ratio)
                    $newHeight = [int]($height * $ratio)
                    $resized = New-Object System.Drawing.Bitmap $newWidth, $newHeight
                    $g = [System.Drawing.Graphics]::FromImage($resized)
                    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                    $g.DrawImage($bitmap, 0, 0, $newWidth, $newHeight)
                    $g.Dispose()
                    $bitmap.Dispose()
                    $bitmap = $resized
                }

                $stream = New-Object System.IO.MemoryStream
                $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Jpeg)
                $bytes = $stream.ToArray()
                $base64 = [Convert]::ToBase64String($bytes)
                
                $bitmap.Dispose()
                $graphic.Dispose()
                $stream.Dispose()
                
                Write-Output $base64
            `;

            const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript}"`, { maxBuffer: 50 * 1024 * 1024 });
            const base64Data = stdout.trim();
            
            const byteSize = Buffer.from(base64Data, 'base64').length;
            if (byteSize > MAX_IMAGE_BYTES) {
                return {
                    toolName: 'capture_screenshot',
                    success: false,
                    output: `Screenshot exceeded maximum allowed size (${byteSize} bytes > ${MAX_IMAGE_BYTES} bytes).`
                };
            }

            return {
                toolName: 'capture_screenshot',
                success: true,
                output: 'Screenshot captured successfully.',
                attachments: [
                    {
                        type: 'image',
                        mimeType: 'image/jpeg',
                        data: base64Data
                    }
                ]
            };
        } catch (error: any) {
            return {
                toolName: 'capture_screenshot',
                success: false,
                output: `Failed to capture screenshot: ${error.message}`
            };
        }
    }
};
