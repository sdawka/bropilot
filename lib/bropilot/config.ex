defmodule Bropilot.Config do
  @moduledoc """
  Config-driven backend selection for storage and state implementations.

  Reads the `BROPILOT_BACKEND` environment variable to determine which
  backend implementations to use:

  - `"local"` (default) — `FileStorage` + `GenServerState`
  - `"cloud"` — `CloudStorage` + `DurableObjectState`

  ## Usage

  Call `apply!/0` at application startup to read the env var and set
  the appropriate Application config values. The Storage and State
  facade modules read `Application.get_env/3` on every call, so
  runtime switching via `apply!/0` or `Application.put_env/3` takes
  effect immediately without restart.

  ## Examples

      # At application startup
      Bropilot.Config.apply!()

      # Runtime hot-reload
      System.put_env("BROPILOT_BACKEND", "cloud")
      Bropilot.Config.apply!()

      # Or directly
      Application.put_env(:bropilot, :storage_backend, Bropilot.Storage.CloudStorage)
      Application.put_env(:bropilot, :state_backend, Bropilot.State.DurableObjectState)
  """

  @doc """
  Resolves the `BROPILOT_BACKEND` env var to an atom (`:local` or `:cloud`).

  Returns `:local` when the env var is unset.
  Raises `ArgumentError` for invalid values.
  """
  @spec resolve() :: :local | :cloud
  def resolve do
    case System.get_env("BROPILOT_BACKEND") do
      nil -> :local
      "local" -> :local
      "cloud" -> :cloud
      invalid ->
        raise ArgumentError,
          ~s(Invalid BROPILOT_BACKEND: "#{invalid}". Must be "local" or "cloud".)
    end
  end

  @doc """
  Returns the storage module for the current `BROPILOT_BACKEND` setting.
  """
  @spec storage_module() :: module()
  def storage_module do
    case resolve() do
      :local -> Bropilot.Storage.FileStorage
      :cloud -> Bropilot.Storage.CloudStorage
    end
  end

  @doc """
  Returns the state module for the current `BROPILOT_BACKEND` setting.
  """
  @spec state_module() :: module()
  def state_module do
    case resolve() do
      :local -> Bropilot.State.GenServerState
      :cloud -> Bropilot.State.DurableObjectState
    end
  end

  @doc """
  Reads `BROPILOT_BACKEND` and applies the corresponding storage and state
  backend modules to the application config.

  Raises `ArgumentError` if the value is invalid.

  This function is safe to call multiple times (idempotent). Since
  `Bropilot.Storage.backend/0` and `Bropilot.State.backend/0` read
  `Application.get_env` on every call, changes take effect immediately.
  """
  @spec apply!() :: :ok
  def apply! do
    backend = resolve()

    {storage_mod, state_mod} =
      case backend do
        :local -> {Bropilot.Storage.FileStorage, Bropilot.State.GenServerState}
        :cloud -> {Bropilot.Storage.CloudStorage, Bropilot.State.DurableObjectState}
      end

    Application.put_env(:bropilot, :storage_backend, storage_mod)
    Application.put_env(:bropilot, :state_backend, state_mod)

    :ok
  end
end
