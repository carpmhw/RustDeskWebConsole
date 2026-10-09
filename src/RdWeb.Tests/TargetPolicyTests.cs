using Microsoft.EntityFrameworkCore;
using RdWeb.Api.Data;
using RdWeb.Api.Data.Entities;
using RdWeb.Api.Targets;

namespace RdWeb.Tests;

public sealed class TargetPolicyTests
{
    // Viewer即使有遺留或惡意flags也只能看metadata，不能升為操作員。
    [Fact]
    public async Task ViewerNeverGainsActionRights()
    {
        await using var database = new AppDbContext(AppDbContextFactory.CreateOptions(":memory:"));
        var result = await new TargetPolicy(database).RightsAsync(new User { Role = "viewer" }, new Target());
        Assert.Equal(new TargetRights(false, false, false), result);
    }
}
