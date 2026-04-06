work = "/Users/sdawka/Code/bropilot/.factory/validation/crud-generator/user-testing/tmp/terminal-gen-2/val-cross-030"
File.rm_rf!(work)
File.mkdir_p!(work)
map_dir = Path.join(work, "map")
specs_dir = Path.join([map_dir, "solution", "specs"])
File.mkdir_p!(specs_dir)

mock_specs = Bropilot.Pipeline.Act2.Extractor.mock_specs_data()
for {category, data} <- mock_specs do
  Bropilot.Yaml.encode_to_file(%{category => data}, Path.join(specs_dir, "#{category}.yaml"))
end

output_dir = Path.join(work, "generated")
{:ok, result} = Bropilot.Generator.generate_all(map_dir, output_dir)

{:ok, types} = File.read(result.types_file)
{:ok, routes} = File.read(result.routes_file)
{:ok, sql} = File.read(result.migration_file)
{:ok, tests} = File.read(result.tests_file)

interfaces = Regex.scan(~r/export interface\s+\w+/, types) |> length()
table_count = Regex.scan(~r/CREATE TABLE IF NOT EXISTS/, sql) |> length()
routes_has_get = String.contains?(routes, "app.get")
routes_has_post = String.contains?(routes, "app.post")
tests_has_describe = String.contains?(tests, "describe(")
tests_has_test = String.contains?(tests, "test(")

summary = [
  "types_file=#{result.types_file}",
  "routes_file=#{result.routes_file}",
  "migration_file=#{result.migration_file}",
  "tests_file=#{result.tests_file}",
  "interface_count=#{interfaces}",
  "table_count=#{table_count}",
  "routes_has_get=#{routes_has_get}",
  "routes_has_post=#{routes_has_post}",
  "tests_has_describe=#{tests_has_describe}",
  "tests_has_test=#{tests_has_test}"
] |> Enum.join("\n")

File.write!("/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-CROSS-030-generate-summary.txt", summary <> "\n")

IO.puts(summary)
