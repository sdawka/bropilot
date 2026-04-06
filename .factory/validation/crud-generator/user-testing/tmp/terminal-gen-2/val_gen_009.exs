repo_root = "/Users/sdawka/Code/bropilot"
work_root = Path.join(repo_root, ".factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-gen-009-project")
File.rm_rf!(work_root)
File.mkdir_p!(work_root)

src_map = Path.join(repo_root, "demo/.bropilot/map")
map_dir = Path.join(work_root, ".bropilot/map")
File.mkdir_p!(Path.dirname(map_dir))
{:ok, _} = File.cp_r(src_map, map_dir)

response_fn = fn _messages, _opts ->
  {:ok, """
  ```file:lib/demo/from_step8.ex
  defmodule Demo.FromStep8 do
    def ok, do: :ok
  end
  ```
  """}
end

result = Bropilot.Pipeline.Act3.Executor.run(work_root,
  map_dir: map_dir,
  execution_mode: :llm,
  llm_opts: [provider: :mock, response_fn: response_fn]
)

output_files = Path.wildcard(Path.join([work_root, "output", "**", "*"])) |> Enum.filter(&File.regular?/1)
relative_files = Enum.map(output_files, &Path.relative_to(&1, work_root))

required = ["types.ts", "routes.ts", "migration.sql", "tests.test.ts"]
required_found =
  for name <- required, into: %{} do
    {name, Enum.any?(relative_files, &String.ends_with?(&1, name))}
  end

report_path = "/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-GEN-009-step8-summary.txt"

body = [
  "act3_run_result=#{inspect(result)}",
  "output_files=#{inspect(relative_files)}",
  "required_artifacts_found=#{inspect(required_found)}"
] |> Enum.join("\n")

File.write!(report_path, body <> "\n")
IO.puts(body)
