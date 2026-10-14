import { describe, expect, it } from 'vitest';
import { speechChunks } from '@/lib/speechChunks';

describe('speechChunks', () => {
  it('splits at sentence ends and line breaks', () => {
    const long = 'ಕರ್ನಾಟಕವು ಭಾರತದ ದಕ್ಷಿಣ ಭಾಗದಲ್ಲಿರುವ ಒಂದು ರಾಜ್ಯ. ಇದರ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು ನಗರವಾಗಿದೆ ಎಂದು ಎಲ್ಲರಿಗೂ ತಿಳಿದಿದೆ.';
    const chunks = speechChunks(`${long}\nಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ ಮತ್ತು ಇದು ಬಹಳ ಹಳೆಯ ಭಾಷೆಯಾಗಿದೆ ಎಂದು ಹೇಳಲಾಗುತ್ತದೆ`);
    expect(chunks).toEqual([
      'ಕರ್ನಾಟಕವು ಭಾರತದ ದಕ್ಷಿಣ ಭಾಗದಲ್ಲಿರುವ ಒಂದು ರಾಜ್ಯ.',
      'ಇದರ ರಾಜಧಾನಿ ಬೆಂಗಳೂರು ನಗರವಾಗಿದೆ ಎಂದು ಎಲ್ಲರಿಗೂ ತಿಳಿದಿದೆ.',
      'ಕನ್ನಡ ಇದರ ಅಧಿಕೃತ ಭಾಷೆ ಮತ್ತು ಇದು ಬಹಳ ಹಳೆಯ ಭಾಷೆಯಾಗಿದೆ ಎಂದು ಹೇಳಲಾಗುತ್ತದೆ',
    ]);
  });

  it('merges very short pieces and drops blank ones', () => {
    expect(speechChunks('ಹೌದು.\n\n  ಸರಿ.  ')).toEqual(['ಹೌದು. ಸರಿ.']);
  });

  it('splits overlong sentences at spaces', () => {
    const word = 'ಕನ್ನಡ';
    const chunks = speechChunks(Array(100).fill(word).join(' '), 60);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 60)).toBe(true);
    expect(chunks.join(' ')).toBe(Array(100).fill(word).join(' '));
  });

  it('returns nothing for empty text', () => {
    expect(speechChunks('   \n ')).toEqual([]);
  });
});
