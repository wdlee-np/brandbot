// 퀴즈 정답 정규화 판정 서비스
// 공백, 대소문자, 특수문자 정규화 후 비교

// 한글 자모 분해 (유사 답변 허용)
function decomposeHangul(text: string): string {
  const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  const JUNGSUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  const JONGSUNG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

  return text.split('').map((char) => {
    const code = char.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return char;
    const offset = code - 0xAC00;
    const cho = Math.floor(offset / (21 * 28));
    const jung = Math.floor((offset % (21 * 28)) / 28);
    const jong = offset % 28;
    return CHOSUNG[cho] + JUNGSUNG[jung] + (JONGSUNG[jong] || '');
  }).join('');
}

export function normalizeAnswer(text: string): string {
  return decomposeHangul(
    text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')         // 공백 전부 제거
      .replace(/[^\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318Fa-z0-9]/g, '') // 특수문자 제거
  );
}

// 정답 판정 (정규화 후 완전 일치 또는 포함 관계)
// 예: 정답 "미국 애틀랜타" → "애틀랜타" 입력 시 정답 처리
export function judgeAnswer(userAnswer: string, correctAnswer: string): boolean {
  if (!userAnswer || !correctAnswer) return false;
  const normalUser = normalizeAnswer(userAnswer);
  const normalCorrect = normalizeAnswer(correctAnswer);
  if (normalUser === normalCorrect) return true;
  // 핵심어 포함 관계 허용 (최소 2글자 이상)
  if (normalUser.length >= 2 && normalCorrect.includes(normalUser)) return true;
  if (normalCorrect.length >= 2 && normalUser.includes(normalCorrect)) return true;
  return false;
}
