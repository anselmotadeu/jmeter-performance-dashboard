import {
  normalizePhone,
  passwordSchema,
  signUpSchema,
} from "@/lib/auth-validation";
describe("authentication validation", () => {
  it("requires a strong password", () => {
    expect(passwordSchema.safeParse("Senha@123").success).toBe(true);
    expect(passwordSchema.safeParse("senha123").success).toBe(false);
  });
  it("normalizes account data", () => {
    expect(normalizePhone("+55 (11) 99999-9999")).toBe("+5511999999999");
    expect(
      signUpSchema.parse({
        firstName: " Maria ",
        lastName: " Silva ",
        email: "MARIA@EXAMPLE.COM",
        phone: "+5511999999999",
        password: "Senha@123",
      }).email,
    ).toBe("maria@example.com");
  });
});
