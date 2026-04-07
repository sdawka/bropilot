defmodule Bropilot.CLI.HelpersTest do
  use ExUnit.Case

  alias Bropilot.CLI.Helpers
  alias Bropilot.CLI.Setup

  describe "ensure_project!/1" do
    setup do
      tmp = System.tmp_dir!() |> Path.join("bropilot_cli_test_#{:rand.uniform(100_000)}")
      File.mkdir_p!(tmp)
      on_exit(fn -> File.rm_rf!(tmp) end)
      {:ok, tmp_dir: tmp}
    end

    test "raises for missing .bropilot/ directory", %{tmp_dir: dir} do
      assert_raise Mix.Error, ~r/No .bropilot\/ directory found/, fn ->
        Helpers.ensure_project!(dir)
      end
    end

    test "returns bropilot dir for valid project", %{tmp_dir: dir} do
      bropilot_dir = Path.join(dir, ".bropilot")
      File.mkdir_p!(bropilot_dir)
      assert Helpers.ensure_project!(dir) == bropilot_dir
    end
  end

  describe "ensure_llm!/0" do
    test "raises when no LLM provider is configured" do
      # In test env, no API keys are set, so provider is :mock
      if Bropilot.LLM.provider() == :mock do
        assert_raise Mix.Error, ~r/No LLM provider configured/, fn ->
          Helpers.ensure_llm!()
        end
      end
    end
  end

  describe "llm_configured?/0" do
    test "returns a boolean" do
      result = Helpers.llm_configured?()
      assert is_boolean(result)
    end
  end

  describe "print_progress/3" do
    test "formats correctly with label" do
      # Capture output to verify no crash; print_progress writes via Mix.shell
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_progress(3, 8, "Building specs")
          Mix.shell(Mix.Shell.Process)
        end)

      assert output =~ "3/8"
      assert output =~ "Building specs"
    end

    test "handles 0/0 without error" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_progress(0, 0, "empty")
          Mix.shell(Mix.Shell.Process)
        end)

      assert output =~ "0/0"
    end

    test "handles completion (total == current)" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_progress(5, 5, "done")
          Mix.shell(Mix.Shell.Process)
        end)

      assert output =~ "5/5"
      assert output =~ "done"
    end
  end

  describe "print_table/2" do
    test "aligns columns correctly" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_table(["Name", "Status"], [["problem", "filled"], ["solution", "empty"]])
          Mix.shell(Mix.Shell.Process)
        end)

      lines = String.split(output, "\n", trim: true)

      # Header, separator, and 2 data rows
      assert length(lines) >= 4

      # All rows should contain both columns
      assert Enum.any?(lines, &String.contains?(&1, "problem"))
      assert Enum.any?(lines, &String.contains?(&1, "filled"))
      assert Enum.any?(lines, &String.contains?(&1, "solution"))
      assert Enum.any?(lines, &String.contains?(&1, "empty"))
    end

    test "handles empty rows" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_table(["A", "B"], [])
          Mix.shell(Mix.Shell.Process)
        end)

      # Should at least print header and separator
      assert output =~ "A"
      assert output =~ "B"
    end
  end

  describe "print_header/1" do
    test "prints without error" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_header("Test Header")
          Mix.shell(Mix.Shell.Process)
        end)

      assert output =~ "Test Header"
    end
  end

  describe "print_success/1, print_error/1, print_warning/1, print_info/1" do
    test "print messages without error" do
      output =
        ExUnit.CaptureIO.capture_io(fn ->
          Mix.shell(Mix.Shell.IO)
          Helpers.print_success("ok")
          Helpers.print_error("fail")
          Helpers.print_warning("warn")
          Helpers.print_info("info")
          Mix.shell(Mix.Shell.Process)
        end)

      assert output =~ "ok"
      assert output =~ "fail"
      assert output =~ "warn"
      assert output =~ "info"
    end
  end

  describe "Setup.check_environment/0" do
    test "returns a list of status items" do
      statuses = Setup.check_environment()
      assert is_list(statuses)
      assert length(statuses) == 4

      for status <- statuses do
        assert Map.has_key?(status, :name)
        assert Map.has_key?(status, :status)
        assert Map.has_key?(status, :detail)
        assert status.status in [:ok, :warning, :missing]
      end
    end

    test "includes Elixir version" do
      statuses = Setup.check_environment()
      elixir = Enum.find(statuses, &(&1.name == "Elixir"))
      assert elixir != nil
      assert elixir.status == :ok
      assert elixir.detail =~ "v"
    end

    test "includes LLM provider status" do
      statuses = Setup.check_environment()
      llm = Enum.find(statuses, &(&1.name == "LLM Provider"))
      assert llm != nil
      assert llm.status in [:ok, :warning]
    end

    test "includes Git status" do
      statuses = Setup.check_environment()
      git = Enum.find(statuses, &(&1.name == "Git"))
      assert git != nil
    end
  end
end
