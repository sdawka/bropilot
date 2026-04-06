behaviours = %{
  "behaviours" => [
    %{"name" => "Create task with valid data", "given" => "g", "when" => "w", "then" => "t"},
    %{"name" => "Assign task to user", "given" => "g", "when" => "w", "then" => "t"},
    %{"name" => "Complete a task", "given" => "g", "when" => "w", "then" => "t"}
  ]
}

out = Bropilot.Generator.generate_test_stubs(behaviours)
path = "/Users/sdawka/.factory/missions/d8fa6f8d-4b8d-4089-827f-d5cd03a2e873/evidence/crud-generator/terminal-gen-2/VAL-GEN-007-tests.test.ts"
File.write!(path, out)
count = Regex.scan(~r/(?:describe|test)\(/, out) |> length()
IO.puts("test_or_describe_blocks=#{count}")
IO.puts("contains_todo=#{String.contains?(out, "TODO")}")
IO.puts("contains_expect_placeholder=#{String.contains?(out, "expect(true).toBe(false)")}")
IO.puts(out)
