# frozen_string_literal: true

module Kofy
  module OteriaScope
    module_function

    def oteria?(doc)
      names = Array(doc.data["categories"]) + Array(doc.data["tags"])
      names.any? { |name| name.to_s.casecmp("OTERIA").zero? }
    end

    def scrub(catalog, docs)
      return unless catalog

      ids = docs.map(&:id)
      catalog.each_value do |list|
        list.reject! { |doc| ids.include?(doc.id) }
      end
      catalog.delete_if { |_, list| list.empty? }
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  oteria = site.posts.docs.select { |doc| Kofy::OteriaScope.oteria?(doc) }
  site.data["oteria_posts"] = oteria

  oteria.each do |doc|
    doc.data["oteria_tags"] = Array(doc.data["tags"])
    doc.data["hidden"] = true
    doc.data["categories"] = []
    doc.data["tags"] = []
  end
end

class OteriaIsolate < Jekyll::Generator
  priority :highest

  def generate(site)
    oteria = site.data["oteria_posts"]
    return if oteria.nil? || oteria.empty?

    site.posts.docs.reject! { |doc| oteria.include?(doc) }
    Kofy::OteriaScope.scrub(site.categories, oteria)
    Kofy::OteriaScope.scrub(site.tags, oteria)
  end
end

Jekyll::Hooks.register :site, :pre_render do |site|
  oteria = site.data["oteria_posts"]
  next if oteria.nil? || oteria.empty?

  oteria.each do |doc|
    site.posts.docs << doc unless site.posts.docs.include?(doc)
  end
end
