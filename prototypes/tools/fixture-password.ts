// The fixture password is published on purpose.
//
// It guards nothing. The plaintext it protects is committed next to the
// ciphertext in prototypes/fixtures/protected/, because the corpus has to be
// reproducible and the decryption flow has to be testable.
//
// This is the opposite of the rule for real content. Real protected posts keep
// their plaintext only in the ignored .private/posts/, their password is typed
// at a hidden prompt and never written down, and neither may ever enter the
// repository. See AGENTS.md and docs/encrypted-posts.md.

export const FIXTURE_PASSWORD = 'fixture-password-not-a-secret';
