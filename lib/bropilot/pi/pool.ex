defmodule Bropilot.Pi.Pool do
  @moduledoc """
  Manages a pool of pi coding-agent processes.
  Uses DynamicSupervisor to spawn and supervise Pi.Port instances.
  """

  use DynamicSupervisor

  def start_link(opts \\ []) do
    DynamicSupervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end

  def checkout(opts \\ []) do
    spec = {Bropilot.Pi.Port, opts}

    case DynamicSupervisor.start_child(__MODULE__, spec) do
      {:ok, pid} -> {:ok, pid}
      error -> error
    end
  end

  def checkin(pid) do
    Bropilot.Pi.Port.stop(pid)
  end
end
