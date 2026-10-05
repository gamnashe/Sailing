// Pure business rules shared by both data stores and the UI.

// Helper: Calculate duration in hours between two HH:mm strings
export function calculateDurationHours(depTime: string, retTime: string): number {
  try {
    const [depH, depM] = depTime.split(':').map(Number);
    const [retH, retM] = retTime.split(':').map(Number);
    let diffMinutes = (retH * 60 + retM) - (depH * 60 + depM);
    if (diffMinutes <= 0) {
      diffMinutes += 24 * 60; // Crosses midnight
    }
    const hours = Math.round((diffMinutes / 60) * 10) / 10;
    return hours > 0 ? hours : 3;
  } catch {
    return 3;
  }
}

// Helper: Calculate private sail credit cost (3 credits for min 3 hours + 1 per extra hour)
export function calculatePrivateSailCredits(durationHours: number): number {
  const roundedHours = Math.ceil(durationHours);
  if (roundedHours <= 3) return 3;
  return 3 + (roundedHours - 3);
}

// Password Complexity Validator: at least 8 characters, letters & numbers
export function validatePasswordComplexity(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: 'הסיסמה חייבת להכיל לפחות 8 תווים' };
  }
  const hasLetter = /[a-zA-Zא-ת]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  if (!hasLetter || !hasDigit) {
    return { valid: false, error: 'הסיסמה חייבת לשלב אותיות ומספרים' };
  }
  return { valid: true };
}
