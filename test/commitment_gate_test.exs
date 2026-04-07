defmodule Bropilot.CommitmentGateTest do
  use ExUnit.Case, async: true

  alias Bropilot.Spaces

  defp setup_map do
    tmp = System.tmp_dir!() |> Path.join("bropilot_commit_gate_#{:rand.uniform(1_000_000)}")
    File.mkdir_p!(tmp)

    for space <- ~w(problem solution work measurement knowledge) do
      File.mkdir_p!(Path.join(tmp, space))
    end

    on_exit_cleanup(tmp)
    tmp
  end

  defp on_exit_cleanup(tmp) do
    ExUnit.Callbacks.on_exit(fn -> File.rm_rf!(tmp) end)
  end

  defp fill_problem(map_dir) do
    p = Path.join(map_dir, "problem")
    for slot <- ~w(audience problem context assumptions hypotheses) do
      File.write!(Path.join(p, "#{slot}.yaml"), "x: 1")
    end
  end

  defp fill_solution(map_dir) do
    s = Path.join(map_dir, "solution")
    File.write!(Path.join(s, "vocabulary.yaml"), "x: 1")
    for d <- ~w(domain flows architecture specs) do
      File.mkdir_p!(Path.join(s, d))
    end
  end

  test "both empty -> error with both populated" do
    map = setup_map()
    assert {:error, {:unfilled_slots, %{problem: p, solution: s}}} =
             Spaces.validate_commitment_gate(map)

    assert length(p) > 0
    assert length(s) > 0
  end

  test "only problem filled -> error with empty problem, populated solution" do
    map = setup_map()
    fill_problem(map)

    assert {:error, {:unfilled_slots, %{problem: [], solution: s}}} =
             Spaces.validate_commitment_gate(map)

    assert length(s) > 0
  end

  test "only solution filled -> error with populated problem, empty solution" do
    map = setup_map()
    fill_solution(map)

    assert {:error, {:unfilled_slots, %{problem: p, solution: []}}} =
             Spaces.validate_commitment_gate(map)

    assert length(p) > 0
  end

  test "both filled -> :ok" do
    map = setup_map()
    fill_problem(map)
    fill_solution(map)

    assert :ok = Spaces.validate_commitment_gate(map)
  end
end
