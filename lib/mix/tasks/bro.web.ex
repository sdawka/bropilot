defmodule Mix.Tasks.Bro.Web do
  @shortdoc "Manage the Bropilot web UI (build, dev, deploy)"

  @moduledoc """
  Commands for the Astro-based web dashboard.

      $ mix bro.web build    # Build the Astro site
      $ mix bro.web dev      # Start Astro dev server
      $ mix bro.web deploy   # Build and deploy to Cloudflare Pages
  """

  use Mix.Task

  @web_dir "web"

  @impl Mix.Task
  def run(args) do
    case args do
      ["build"] -> build()
      ["dev"] -> dev()
      ["deploy"] -> deploy()
      _ -> Mix.shell().info("Usage: mix bro.web [build|dev|deploy]")
    end
  end

  defp build do
    web_dir = Path.join(File.cwd!(), @web_dir)
    ensure_web_dir!(web_dir)

    Mix.shell().info("Building Astro site in #{@web_dir}/...")

    case System.cmd("npm", ["run", "build"], cd: web_dir, into: IO.stream(:stdio, :line)) do
      {_, 0} ->
        Mix.shell().info(
          "\n#{IO.ANSI.green()}✓#{IO.ANSI.reset()} Web UI built successfully → #{@web_dir}/dist/"
        )

      {_, code} ->
        Mix.raise("Build failed with exit code #{code}")
    end
  end

  defp dev do
    web_dir = Path.join(File.cwd!(), @web_dir)
    ensure_web_dir!(web_dir)

    Mix.shell().info("Starting Astro dev server...")

    # Use Port for interactive process so it streams output
    port =
      Port.open({:spawn_executable, System.find_executable("npm")}, [
        :binary,
        :exit_status,
        args: ["run", "dev"],
        cd: web_dir,
        env: []
      ])

    stream_port(port)
  end

  defp deploy do
    deploy_script = Path.join(File.cwd!(), "deploy.sh")

    unless File.exists?(deploy_script) do
      Mix.raise("deploy.sh not found at project root. Cannot deploy.")
    end

    Mix.shell().info("Deploying Bropilot web UI to Cloudflare Pages...")

    case System.cmd("bash", [deploy_script], into: IO.stream(:stdio, :line)) do
      {_, 0} ->
        Mix.shell().info(
          "\n#{IO.ANSI.green()}✓#{IO.ANSI.reset()} Deployed successfully!"
        )

      {_, code} ->
        Mix.raise("Deploy failed with exit code #{code}")
    end
  end

  defp ensure_web_dir!(web_dir) do
    unless File.dir?(web_dir) do
      Mix.raise("No #{@web_dir}/ directory found. Expected at: #{web_dir}")
    end
  end

  defp stream_port(port) do
    receive do
      {^port, {:data, data}} ->
        IO.write(data)
        stream_port(port)

      {^port, {:exit_status, 0}} ->
        :ok

      {^port, {:exit_status, code}} ->
        Mix.raise("Dev server exited with code #{code}")
    end
  end
end
