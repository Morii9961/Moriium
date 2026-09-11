import process from 'node:process';

/**
 * Ctrl+V as it arrives when the terminal does not paste for us.
 *
 * A terminal that owns the paste gesture inserts the clipboard as ordinary
 * text and this program never sees a keystroke. A terminal that passes the key
 * through in raw mode sends SYN instead, and the clipboard never leaves the
 * clipboard. Both look identical to someone watching a prompt that echoes
 * nothing, so the read has to name it.
 */
const PASTE_KEY = '\u0016';

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
  let sawPasteKey = false;

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
          // An empty read must not be handed back as a secret. Every caller
          // validates what it receives, and every one of those checks would
          // describe the empty string instead of the missing input: a password
          // that never arrived gets answered with "at least 24 characters",
          // which sends the author to lengthen something they already typed.
          if (value.length === 0) {
            reject(new Error(emptyReadMessage(sawPasteKey)));
            return;
          }
          resolvePrompt(value);
          return;
        }
        if (character === PASTE_KEY) {
          sawPasteKey = true;
        } else if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.on('data', onData);
  });
}

function emptyReadMessage(sawPasteKey) {
  if (!sawPasteKey) return 'No input was received.';
  return [
    'No input was received: Ctrl+V reached this program as a control character,',
    'so this terminal did not paste and the clipboard was never read.',
    'Type the secret instead, or run the command in a terminal whose paste',
    'inserts text.',
  ].join(' ');
}
