import {
  EventAchievements,
  EventNotification,
} from "../modules/NotificationLevels";

describe("NotificationLevels constants", () => {
  it("EventAchievements equals 1", () => {
    expect(EventAchievements).toBe(1);
  });

  it("EventNotification equals 2", () => {
    expect(EventNotification).toBe(2);
  });

  it("constants are powers of 2 (bitfield-compatible)", () => {
    // Each level should be a power of 2 so they can be combined via bitwise OR
    expect(EventAchievements & (EventAchievements - 1)).toBe(0);
    expect(EventNotification & (EventNotification - 1)).toBe(0);
  });

  it("constants are distinct and non-overlapping bit flags", () => {
    expect(EventAchievements & EventNotification).toBe(0);
  });
});
