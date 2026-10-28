
import { canEditWorkItem as canEditAsAdmin } from "./worksheetPermissions";

test("admins can edit any row", () => {
  expect(canEditAsAdmin({ id: "a", role: "admin" }, { id: "r", creator_id: "someone-else" }, [])).toBe(true);
});
