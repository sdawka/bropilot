defmodule Bropilot.Pipeline.Supervisor do
  @moduledoc """
  Supervises the Pipeline.Engine process.
  """

  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(opts) do
    children = [
      {Bropilot.Pipeline.Engine, opts}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end
end
