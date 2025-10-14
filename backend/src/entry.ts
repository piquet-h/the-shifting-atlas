/**
 * Central Azure Functions registration entrypoint (Option A implementation).
 *
 * The Azure Functions Node v4 programming model executes ONLY the module
 * specified by package.json#main (or a root index.js). That module must
 * import every file that performs `app.http(...)` (or other trigger
 * registrations). Keeping imports explicit makes startup deterministic and
 * review-friendly. When adding a new function file under `./functions/`, add
 * a corresponding import here.
 */

// Core registrations (BackendHealth / BackendPing)
// NOTE: Because the backend tsconfig uses moduleResolution "bundler", TypeScript
// preserves the extension-less import. At runtime in plain Node ESM without a
// bundler, we must include the .js extension. Using an explicit relative path
// with extension ensures Node can resolve the compiled file.
import './index.js'

// Function handlers (HTTP / Queue etc.)
// NOTE: For each function module we include the explicit .js extension so that
// Node's ESM loader (no bundler in Azure runtime) resolves correctly.
import './functions/bootstrapPlayer.js'
import './functions/location.js'
import './functions/locationLook.js'
import './functions/ping.js'
import './functions/player.js'
import './functions/playerCreate.js'
import './functions/playerGet.js'
import './functions/playerLink.js'
import './functions/playerMove.js'
import './functions/queueProcessWorldEvent.js'

// (Add new function imports above this line.)
