import prompts from "prompts";

export const isInteractive = (): boolean => process.stdout.isTTY === true && process.stdin.isTTY === true;

export const confirm = async (message: string, defaultValue = false): Promise<boolean> => {
  if (!isInteractive()) {
    return defaultValue;
  }
  const { value } = await prompts(
    {
      type: "confirm",
      name: "value",
      message,
      initial: defaultValue,
    },
    { onCancel: () => process.exit(130) },
  );
  return Boolean(value);
};

export const text = async (message: string, validate?: (v: string) => string | true): Promise<string | undefined> => {
  if (!isInteractive()) {
    return undefined;
  }
  const { value } = await prompts(
    {
      type: "text",
      name: "value",
      message,
      validate: validate
        ? (v: string) => {
            const result = validate(v);
            return result === true ? true : result;
          }
        : undefined,
    },
    { onCancel: () => process.exit(130) },
  );
  return typeof value === "string" ? value : undefined;
};
