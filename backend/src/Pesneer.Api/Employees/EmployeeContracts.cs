namespace Pesneer.Api.Employees;

public sealed record CreateEmployeeRequest(
    string FirstName,
    string LastName,
    string PhoneNumber,
    string Email,
    string Role,
    string Password,
    bool CanSelfSchedule = false);

public sealed record UpdateEmployeeRequest(
    string FirstName,
    string LastName,
    string PhoneNumber,
    string Email,
    string Role,
    bool IsActive,
    string? NewPassword,
    bool CanSelfSchedule = false);

public sealed record EmployeeResponse(
    Guid Id,
    string Name,
    string Email,
    string PhoneNumber,
    string Role,
    bool IsActive,
    bool CanSelfSchedule);
