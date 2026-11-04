using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using RdWeb.Api.Configuration;
using RdWeb.Api.Security;

namespace RdWeb.Api.Infrastructure;

public static class AuthenticationRegistration
{
    // 註冊認證元件與完整 JWT 驗證，不記錄 token 或 crypto 例外。
    public static void AddApplicationAuthentication(this IServiceCollection services)
    {
        services.Configure<Microsoft.AspNetCore.Routing.RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        services.ConfigureHttpJsonOptions(options => options.SerializerOptions.UnmappedMemberHandling = System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow);
        services.AddSingleton(provider => AuthOptions.FromConfiguration(provider.GetRequiredService<IConfiguration>()));
        services.AddSingleton(provider => new Vault(provider.GetRequiredService<AuthOptions>().VaultKey, provider.GetRequiredService<AuthOptions>().VaultKeyVersion));
        services.AddSingleton<PasswordHasher>(); services.AddSingleton<TotpService>(); services.AddSingleton<TokenService>();
        services.AddSingleton<SessionValidator>(); services.AddSingleton<AuthMutationGate>(); services.AddSingleton<AuthRateLimiter>();
        services.AddScoped<AuthService>();
        services.AddScoped<MfaService>();
        services.AddScoped<AdminService>();
        services.AddSingleton<RdWeb.Api.RustDesk.IHostResolver, RdWeb.Api.RustDesk.NativeHostResolver>();
        services.AddSingleton<RdWeb.Api.RustDesk.ApprovedHostResolver>();
        services.AddSingleton<RdWeb.Api.RustDesk.RendezvousTransport>();
        services.AddScoped<RdWeb.Api.RustDesk.ConnectionCoordinator>();
        services.AddSingleton<RdWeb.Api.RustDesk.ConnectionSlots>();
        services.AddSingleton<RdWeb.Api.RustDesk.RelayBridge>();
        services.AddSingleton<RdWeb.Api.RustDesk.ActiveConnectionRegistry>();
        services.AddScoped<RdWeb.Api.RustDesk.LoginAssistService>();
        services.AddSingleton<RdWeb.Api.RustDesk.ConnectionProbe>();
        services.AddSingleton<RdWeb.Api.RustDesk.ProbeSlots>();
        services.AddScoped<RdWeb.Api.RustDesk.ServerService>();
        services.AddScoped<EncryptedSecretStore>();
        services.AddScoped<RdWeb.Api.Targets.TargetPolicy>();
        services.AddScoped<RdWeb.Api.Targets.TargetService>();
        services.AddScoped<RdWeb.Api.Targets.TargetSecretsService>();
        services.AddScoped<RdWeb.Api.Targets.TargetTransferService>();
        services.AddScoped<RdWeb.Api.RustDesk.ConnectionTicketService>();
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<TokenService>((options, tokens) =>
        {
            options.MapInboundClaims = false; options.SaveToken = false; options.IncludeErrorDetails = false;
            options.TokenValidationParameters = tokens.ValidationParameters();
            options.Events = new JwtBearerEvents
            {
                // JWT 驗簽後再確認可撤銷的 DB session。
                OnTokenValidated = async context =>
                {
                    var validator = context.HttpContext.RequestServices.GetRequiredService<SessionValidator>();
                    if (context.Principal == null || await validator.ValidateAsync(context.Principal, context.HttpContext.RequestAborted) == null) context.Fail("unauthorized");
                }
            };
        });
        services.AddAuthorization();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;
            options.AddConcurrencyLimiter("auth-work", limiter => { limiter.PermitLimit = 4; limiter.QueueLimit = 0; });
        });
    }
}
