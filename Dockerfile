FROM node:22-alpine AS frontend-build
WORKDIR /source/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /source
COPY backend/src/Pesneer.Api/Pesneer.Api.csproj backend/src/Pesneer.Api/
RUN dotnet restore backend/src/Pesneer.Api/Pesneer.Api.csproj
COPY backend/src/Pesneer.Api/ backend/src/Pesneer.Api/
RUN dotnet publish backend/src/Pesneer.Api/Pesneer.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend-build /source/frontend/dist ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} dotnet Pesneer.Api.dll"]
