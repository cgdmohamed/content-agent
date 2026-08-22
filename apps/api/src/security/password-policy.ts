export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("أن تكون 12 حرفًا على الأقل");
  if (!/\p{L}/u.test(password)) issues.push("أن تحتوي على حرف واحد على الأقل");
  if (!/\p{N}/u.test(password)) issues.push("أن تحتوي على رقم واحد على الأقل");
  if (!/[^\p{L}\p{N}\s]/u.test(password)) issues.push("أن تحتوي على رمز خاص واحد على الأقل");
  return issues;
}

export function strongPasswordMessage(issues: string[]): string {
  return `كلمة المرور غير كافية. يجب ${issues.join("، ")}.`;
}
