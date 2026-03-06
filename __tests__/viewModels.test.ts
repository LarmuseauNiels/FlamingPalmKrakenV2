// ViewModel shape tests — verify that the data model classes instantiate correctly
// and expose the expected properties with the right initial values / types.

jest.mock(".prisma/client", () => ({}), { virtual: true });

import { DashBoardModel, RaidVM } from "../modules/ApiFunctions/ViewModels/dash-board-model";
import { ShopItem } from "../modules/ApiFunctions/ViewModels/shopitem";
import { User } from "../modules/ApiFunctions/ViewModels/user";
import { PointHistoryItem } from "../modules/ApiFunctions/ViewModels/point-history-item";
import { LibraryItem } from "../modules/ApiFunctions/ViewModels/libraryitem";

describe("DashBoardModel", () => {
  it("can be instantiated without arguments", () => {
    const model = new DashBoardModel();
    expect(model).toBeInstanceOf(DashBoardModel);
  });

  it("accepts dashboardPoints, raids, and pointHistory assignments", () => {
    const model = new DashBoardModel();
    model.dashboardPoints = 123;
    model.raids = [];
    model.pointHistory = [];
    expect(model.dashboardPoints).toBe(123);
    expect(model.raids).toEqual([]);
    expect(model.pointHistory).toEqual([]);
  });
});

describe("RaidVM", () => {
  it("can be instantiated and assigned all fields", () => {
    const vm = new RaidVM();
    vm.ID = 1;
    vm.Title = "Epic Raid";
    vm.MinPlayers = 5;
    vm.CreationTime = new Date("2024-01-01");
    vm.Status = 1;
    vm.Attending = 3;
    expect(vm.ID).toBe(1);
    expect(vm.Title).toBe("Epic Raid");
    expect(vm.MinPlayers).toBe(5);
    expect(vm.Status).toBe(1);
    expect(vm.Attending).toBe(3);
  });
});

describe("ShopItem", () => {
  it("can be instantiated without arguments", () => {
    const item = new ShopItem();
    expect(item).toBeInstanceOf(ShopItem);
  });

  it("accepts all expected fields", () => {
    const item = new ShopItem();
    item.id = "r1";
    item.title = "Half-Life 3";
    item.description = "Worth the wait";
    item.price = 200;
    item.image = "hl3.png";
    item.stock = 5;
    item.nonSalePrice = 300;
    expect(item.id).toBe("r1");
    expect(item.title).toBe("Half-Life 3");
    expect(item.price).toBe(200);
    expect(item.stock).toBe(5);
    expect(item.nonSalePrice).toBe(300);
  });
});

describe("User ViewModel", () => {
  it("can be instantiated without arguments", () => {
    const user = new User();
    expect(user).toBeInstanceOf(User);
  });

  it("accepts userid, username, avatar, and points", () => {
    const user = new User();
    user.userid = "u1";
    user.username = "Niels";
    user.avatar = "abc123";
    user.points = 500;
    expect(user.userid).toBe("u1");
    expect(user.username).toBe("Niels");
    expect(user.avatar).toBe("abc123");
    expect(user.points).toBe(500);
  });
});

describe("PointHistoryItem", () => {
  it("can be instantiated without arguments", () => {
    const item = new PointHistoryItem();
    expect(item).toBeInstanceOf(PointHistoryItem);
  });

  it("accepts timestamp, comment, and points", () => {
    const item = new PointHistoryItem();
    item.timestamp = "2024-01-01T00:00:00Z";
    item.comment = "Daily login";
    item.points = 10;
    expect(item.timestamp).toBe("2024-01-01T00:00:00Z");
    expect(item.comment).toBe("Daily login");
    expect(item.points).toBe(10);
  });
});

describe("LibraryItem interface", () => {
  it("can be represented as a plain object matching the interface", () => {
    const item: LibraryItem = {
      orderId: "order-1",
      game: "Half-Life 3",
      timestamp: "2024-01-10T12:00:00Z",
      redemptionText: "REDEEM-CODE",
    };
    expect(item.orderId).toBe("order-1");
    expect(item.game).toBe("Half-Life 3");
    expect(item.redemptionText).toBe("REDEEM-CODE");
  });
});
