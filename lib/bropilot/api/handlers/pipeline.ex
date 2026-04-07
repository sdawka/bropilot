defmodule Bropilot.Api.Handlers.Pipeline do
  @moduledoc """
  Handlers for pipeline status and advancement endpoints.
  """

  import Bropilot.Api.Router, only: [json: 3]

  alias Bropilot.Pipeline.Engine

  def get_status(conn) do
    case get_engine_pid() do
      {:ok, pid} ->
        current = Engine.current_step(pid)
        phase = Engine.current_phase(pid)
        statuses = Engine.step_status(pid)

        current_data =
          case current do
            %{id: id, name: name, space: space} ->
              %{id: id, name: name, space: space}

            atom when is_atom(atom) ->
              %{phase: atom}

            _ ->
              nil
          end

        json(conn, 200, %{
          ok: true,
          data: %{
            phase: phase,
            current_step: current_data,
            step_statuses: statuses
          }
        })

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: msg})
    end
  end

  def advance(conn) do
    case get_engine_pid() do
      {:ok, pid} ->
        case Engine.advance(pid) do
          {:ok, step} ->
            json(conn, 200, %{
              ok: true,
              data: %{step: %{id: step.id, name: step.name, space: step.space}}
            })

          {:error, :pipeline_complete} ->
            json(conn, 200, %{ok: true, data: %{status: "pipeline_complete"}})

          {:error, {:unfilled_slots, slots}} ->
            json(conn, 422, %{
              ok: false,
              error: "unfilled slots: #{Enum.join(Enum.map(slots, &to_string/1), ", ")}"
            })

          {:error, reason} ->
            json(conn, 500, %{ok: false, error: inspect(reason)})
        end

      {:error, msg} ->
        json(conn, 400, %{ok: false, error: msg})
    end
  end

  defp get_engine_pid do
    case Process.whereis(Bropilot.Api.PipelineEngine) do
      nil ->
        {:error, "pipeline not started — call POST /api/init first"}

      pid ->
        {:ok, pid}
    end
  end
end
