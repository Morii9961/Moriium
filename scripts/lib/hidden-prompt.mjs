import process from 'node:process';

/** Reads a secret from an interactive terminal without echoing it. */
export async function hiddenPrompt(
  label,
  { input = process.stdin, output = process.stdout } = {},
) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    throw new Error('An interactive TTY is required so the secret can remain hidden.');
  }

  output.write(label);
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  let value = '';

  return await new Promise((resolvePrompt, reject) => {
    const finish = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          output.write('\n');
          resolvePrompt(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.on('data', onData);
  });
}
