import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PasswordInput from "@/components/auth/PasswordInput";

describe("PasswordInput", () => {
  it("toggles password visibility accessibly", async () => {
    const user = userEvent.setup();
    render(
      <PasswordInput
        id="password"
        name="password"
        label="Senha"
        autoComplete="current-password"
      />,
    );
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Mostrar senha" }));
    expect(input).toHaveAttribute("type", "text");
  });
});
