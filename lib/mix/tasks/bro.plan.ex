defmodule Mix.Tasks.Bro.Plan do
  @shortdoc "Generate a change plan from the latest snapshot"

  @moduledoc """
  Diffs the latest version against the previous version and generates
  a change plan showing what was added, modified, or removed.

      $ mix bro.plan
  """

  use Mix.Task

  alias Bropilot.CLI.Helpers
  alias Bropilot.Pipeline.Act3.{Snapshot, Diff}

  @impl Mix.Task
  def run(_args) do
    Mix.Task.run("app.start")

    bropilot_dir = Helpers.ensure_project!()
    map_dir = Path.join(bropilot_dir, "map")
    version = Snapshot.latest_version(map_dir)

    if version == 0 do
      Helpers.print_error("No snapshots found.")
      Mix.raise("No snapshots found. Run `mix bro.snapshot` first.")
    end

    version_str = Snapshot.format_version(version)
    Helpers.print_header("Change Plan — #{version_str}")

    {:ok, changes} = Diff.generate_change_plan(map_dir, version)

    if changes == [] do
      Helpers.print_info("No changes detected since previous version.")
    else
      summary = Diff.summarize(changes)
      print_summary(summary)
      print_changes(changes)
    end
  end

  defp print_summary(summary) do
    Mix.shell().info("#{IO.ANSI.bright()}Change Summary:#{IO.ANSI.reset()}")

    Mix.shell().info(
      "  #{IO.ANSI.green()}+ #{summary.added} added#{IO.ANSI.reset()}" <>
        "  #{IO.ANSI.yellow()}~ #{summary.modified} modified#{IO.ANSI.reset()}" <>
        "  #{IO.ANSI.red()}- #{summary.removed} removed#{IO.ANSI.reset()}"
    )

    if map_size(summary.by_space) > 0 do
      Mix.shell().info("")

      rows =
        for {space, count} <- summary.by_space do
          [space, "#{count} changes"]
        end

      Helpers.print_table(["Space", "Changes"], rows)
    end
  end

  defp print_changes(changes) when length(changes) > 0 do
    Mix.shell().info("\n#{IO.ANSI.bright()}Changes:#{IO.ANSI.reset()}")

    for change <- changes do
      {icon, color} =
        case change.type do
          :added -> {"+", IO.ANSI.green()}
          :modified -> {"~", IO.ANSI.yellow()}
          :removed -> {"-", IO.ANSI.red()}
        end

      Mix.shell().info("  #{color}#{icon} #{change.path}#{IO.ANSI.reset()}")
    end
  end

  defp print_changes(_), do: :ok
end
