/**
 * Minimal entrypoint used exclusively by EnvironmentValidation.test.ts.
 *
 * Importing environment.ts triggers the Zod schema validation synchronously
 * at module-load time.  If any variable is invalid the module calls
 * process.exit(1) before this line is reached.  A successful import means
 * every required variable passed validation.
 */
import '../../src/config/environment';

process.stdout.write('ENV_OK\n');
