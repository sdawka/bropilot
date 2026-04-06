defmodule Bropilot.State.DurableObjectState do
  @moduledoc """
  Durable Object state interface (stub) for future Cloudflare Workers backend.

  All callbacks return `{:error, :not_implemented}` until a Durable Objects
  provider is integrated. This module exists to define the interface contract
  and enable config-driven switching.
  """

  @behaviour Bropilot.State

  @impl Bropilot.State
  def get(_server, _namespace, _key) do
    {:error, :not_implemented}
  end

  @impl Bropilot.State
  def put(_server, _namespace, _key, _value) do
    {:error, :not_implemented}
  end

  @impl Bropilot.State
  def delete(_server, _namespace, _key) do
    {:error, :not_implemented}
  end

  @impl Bropilot.State
  def list_keys(_server, _namespace) do
    {:error, :not_implemented}
  end
end
