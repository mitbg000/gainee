/**
 * Print a password hash for APP_PASSWORD_HASH in .env.
 * Usage: node dist/hash-password.js            (prompts, input is hidden)
 *        node dist/hash-password.js "secret"   (non-interactive)
 */
import readline from "node:readline";
import { hashPassword } from "@/lib/password";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const r = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    r._writeToOutput = (s: string) => {
      if (s.includes(question)) r.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

(async () => {
  const pw = process.argv[2] || (await ask("New password: "));
  if (pw.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  if (!process.argv[2] && (await ask("Repeat: ")) !== pw) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  console.log(hashPassword(pw));
})();
